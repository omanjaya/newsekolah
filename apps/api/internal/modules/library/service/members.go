package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// maxMemberNoRetries mirrors the old app's retry budget for a member_no
// collision (library_common.go:596-614).
const maxMemberNoRetries = 5

// resolveOrRegisterMember returns userID's library_members row, creating
// one on the fly when auto_register_members is on and the borrow is that
// member's first (old app: library_members.go:606-615).
func (s *Service) resolveOrRegisterMember(ctx context.Context, tenantID, userID uuid.UUID, policy domain.Policy, today time.Time) (domain.Member, error) {
	member, found, err := s.repo.GetMember(ctx, tenantID, userID)
	if err != nil {
		return domain.Member{}, err
	}
	if found {
		return member, nil
	}
	if !policy.AutoRegisterMembers {
		return domain.Member{}, domain.ErrMemberNotFound
	}
	return s.autoRegisterMember(ctx, tenantID, userID, policy, today)
}

func (s *Service) autoRegisterMember(ctx context.Context, tenantID, userID uuid.UUID, policy domain.Policy, today time.Time) (domain.Member, error) {
	role := string(domain.RoleStudent)
	if s.members != nil {
		if r, found, err := s.members.UserRole(ctx, tenantID, userID); err == nil && found {
			role = r
		}
	}
	memberType, found, err := s.repo.GetMemberTypeByRole(ctx, tenantID, role)
	if err != nil {
		return domain.Member{}, err
	}
	if !found {
		return domain.Member{}, domain.ErrMemberTypeNotFound
	}
	return s.createMemberWithGeneratedNo(ctx, tenantID, userID, memberType, policy, today)
}

func (s *Service) createMemberWithGeneratedNo(ctx context.Context, tenantID, userID uuid.UUID, memberType domain.MemberType, policy domain.Policy, today time.Time) (domain.Member, error) {
	// The member number is unique per tenant, not per member type, so the
	// running number has to count every member the school has. Counting one
	// type only meant the first member of a second type restarted at 1 and
	// collided with a number already taken, and the retries below only
	// covered that while the school was small.
	count, err := s.repo.CountMembersTotal(ctx, tenantID)
	if err != nil {
		return domain.Member{}, err
	}
	validUntil := domain.ValidUntilFromRegistration(today, memberType.ValidityMonths)
	// Only a member_no collision is worth another attempt with the next
	// number. A user who is already a member, or any other failure, comes
	// back at once so the caller sees the real reason instead of
	// "could not generate a unique number".
	for attempt := 0; attempt < maxMemberNoRetries; attempt++ {
		memberNo := domain.GenerateMemberNo(policy.MemberNoFormat, today.Year(), count+1+attempt)
		member, err := s.repo.CreateMember(ctx, domain.Member{
			UserID: userID, TenantID: tenantID, MemberNo: memberNo, MemberTypeID: memberType.ID,
			RegisteredOn: today, ValidUntil: &validUntil, Status: domain.MemberActive,
		})
		if err == nil {
			return member, nil
		}
		if !errors.Is(err, domain.ErrMemberNoCollision) {
			return domain.Member{}, err
		}
	}
	return domain.Member{}, domain.ErrMemberNoExhausted
}

// RegisterMember is the manual/desk registration path: an operator picks
// the member type and (optionally) the member number instead of relying on
// the generated pattern.
type RegisterMemberInput struct {
	UserID       uuid.UUID
	MemberTypeID uuid.UUID
	MemberNo     string // empty: generate from the tenant's pattern
	Notes        string
}

func (s *Service) RegisterMember(ctx context.Context, tenantID uuid.UUID, in RegisterMemberInput) (domain.Member, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Member{}, err
	}
	var member domain.Member
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		memberType, found, err := s.repo.GetMemberType(ctx, tenantID, in.MemberTypeID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberTypeNotFound
		}
		today := s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock))
		if in.MemberNo == "" {
			member, err = s.createMemberWithGeneratedNo(ctx, tenantID, in.UserID, memberType, policy, today)
			if err != nil {
				return err
			}
			if in.Notes != "" {
				member, _, err = s.repo.UpdateMemberProfile(ctx, tenantID, in.UserID, memberType.ID, member.ValidUntil, in.Notes)
			}
			return err
		}
		validUntil := domain.ValidUntilFromRegistration(today, memberType.ValidityMonths)
		member, err = s.repo.CreateMember(ctx, domain.Member{
			UserID: in.UserID, TenantID: tenantID, MemberNo: in.MemberNo, MemberTypeID: memberType.ID,
			RegisteredOn: today, ValidUntil: &validUntil, Status: domain.MemberActive, Notes: in.Notes,
		})
		return err
	})
	return member, err
}

// FailedRegistration is one candidate BulkRegisterByRole could not
// register, named so the librarian can tell who failed, with the domain
// error explaining why.
type FailedRegistration struct {
	UserID   uuid.UUID
	UserName string
	Err      error
}

// BulkRegisterResult is BulkRegisterByRole's outcome.
type BulkRegisterResult struct {
	Registered []domain.Member
	Failed     []FailedRegistration
}

// BulkRegisterByRole registers every user of role not already a member
// (optionally narrowed to one class, for students) under memberTypeID --
// old app: library_members.go:783-859.
func (s *Service) BulkRegisterByRole(ctx context.Context, tenantID, memberTypeID uuid.UUID, role string, classID uuid.NullUUID) (BulkRegisterResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return BulkRegisterResult{}, err
	}
	var result BulkRegisterResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		memberType, found, err := s.repo.GetMemberType(ctx, tenantID, memberTypeID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberTypeNotFound
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		candidates, err := s.repo.ListMemberCandidates(ctx, tenantID, role, classID)
		if err != nil {
			return err
		}
		today := s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock))
		for _, c := range candidates {
			member, err := s.createMemberWithGeneratedNo(ctx, tenantID, c.UserID, memberType, policy, today)
			if err != nil {
				result.Failed = append(result.Failed, FailedRegistration{UserID: c.UserID, UserName: c.UserName, Err: err})
				continue
			}
			result.Registered = append(result.Registered, member)
		}
		return nil
	})
	return result, err
}

// storeLapsedSuspensionEnd stores what AsOf and EligibleToBorrow already
// decide on their own: a suspension whose last day has passed on the
// school's calendar is over, and the member is active again. Reads never
// call it (they show AsOf), so a read at a simulated date changes no real
// data. The explicit circulation writes for one member (settling a
// violation, a borrow, a renewal) call it to keep the stored row tidy, and
// only in real time, with the real clock: under simulation it does
// nothing, as the simulated date has not come for real yet.
func (s *Service) storeLapsedSuspensionEnd(ctx context.Context, tenantID, userID uuid.UUID) error {
	if clock.Simulated(ctx) {
		return nil
	}
	_, err := s.repo.EndLapsedSuspension(ctx, tenantID, userID, s.schoolToday(ctx, tenantID, s.clock.Now()))
	return err
}

// memberToday is the school's calendar day a read shows members on
// (clock.Now, so a simulated time applies): domain.Member.AsOf.
func (s *Service) memberToday(ctx context.Context, tenantID uuid.UUID) time.Time {
	return s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock))
}

// GetMember is the member as they stand today (domain.Member.AsOf): a
// suspension whose last day has passed reads as over, without storing it.
func (s *Service) GetMember(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, error) {
	var member domain.Member
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var found bool
		var err error
		member, found, err = s.repo.GetMember(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberNotFound
		}
		return nil
	})
	if err != nil {
		return domain.Member{}, err
	}
	return member.AsOf(s.memberToday(ctx, tenantID)), nil
}

// ListMembersInput narrows ListMembers.
type ListMembersInput struct {
	Status       string
	MemberTypeID uuid.NullUUID
	Search       string
	Limit        int
	Offset       int
}

// ListMembers lists members as they stand today (domain.Member.AsOf), and
// its status filter reads the same: a member whose suspension has ended is
// listed as active, not suspended, without anything being stored.
func (s *Service) ListMembers(ctx context.Context, tenantID uuid.UUID, in ListMembersInput) ([]domain.Member, error) {
	today := s.memberToday(ctx, tenantID)
	var members []domain.Member
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		members, err = s.repo.ListMembers(ctx, tenantID, MemberListFilter{
			Status: in.Status, MemberTypeID: in.MemberTypeID, Search: in.Search, Today: today,
		}, clampLimit(in.Limit), in.Offset)
		return err
	})
	if err != nil {
		return nil, err
	}
	for i := range members {
		members[i] = members[i].AsOf(today)
	}
	return members, nil
}

// UpdateMemberStatus lets staff move a member between statuses directly
// (e.g. reactivate, deactivate); suspension from a late return is set by
// the return flow itself, not this endpoint.
func (s *Service) UpdateMemberStatus(ctx context.Context, tenantID, userID uuid.UUID, status domain.MemberStatus) (domain.Member, error) {
	if !status.Valid() {
		return domain.Member{}, domain.ErrInvalidInput
	}
	var member domain.Member
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var found bool
		var err error
		member, found, err = s.repo.UpdateMemberStatus(ctx, tenantID, userID, status, nil)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberNotFound
		}
		return nil
	})
	if err != nil {
		return domain.Member{}, err
	}
	return member, nil
}

func (s *Service) UpdateMemberProfile(ctx context.Context, tenantID, userID, memberTypeID uuid.UUID, validUntil *time.Time, notes string) (domain.Member, error) {
	var member domain.Member
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var found bool
		var err error
		member, found, err = s.repo.UpdateMemberProfile(ctx, tenantID, userID, memberTypeID, validUntil, notes)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberNotFound
		}
		return nil
	})
	if err != nil {
		return domain.Member{}, err
	}
	// The saved profile answers with the status GetMember shows.
	return member.AsOf(s.memberToday(ctx, tenantID)), nil
}

// Clearance grants "bebas pustaka" only when the member has no active loans
// and no unpaid fines (old app: library_members.go:903-934).
func (s *Service) Clearance(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Member{}, err
	}
	var member domain.Member
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, found, err := s.repo.GetMember(ctx, tenantID, userID); err != nil {
			return err
		} else if !found {
			return domain.ErrMemberNotFound
		}
		counts, err := s.repo.ClearanceCounts(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		if !domain.EligibleForClearance(counts.ActiveLoans, counts.UnpaidViolations > 0) {
			return domain.ErrMemberNotClearable
		}
		var found bool
		member, found, err = s.repo.UpdateMemberStatus(ctx, tenantID, userID, domain.MemberCleared, nil)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberNotFound
		}
		return nil
	})
	return member, err
}

// MemberType management.

func (s *Service) CreateMemberType(ctx context.Context, tenantID uuid.UUID, t domain.MemberType) (domain.MemberType, error) {
	t.TenantID = tenantID
	t.Name = strings.TrimSpace(t.Name)
	if err := t.Validate(); err != nil {
		return domain.MemberType{}, err
	}
	var created domain.MemberType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateMemberType(ctx, t)
		return err
	})
	return created, err
}

func (s *Service) UpdateMemberType(ctx context.Context, tenantID uuid.UUID, t domain.MemberType) (domain.MemberType, error) {
	t.TenantID = tenantID
	t.Name = strings.TrimSpace(t.Name)
	if err := t.Validate(); err != nil {
		return domain.MemberType{}, err
	}
	var updated domain.MemberType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.repo.UpdateMemberType(ctx, t)
		return err
	})
	return updated, err
}

func (s *Service) ListMemberTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MemberType, error) {
	var types []domain.MemberType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		types, err = s.repo.ListMemberTypes(ctx, tenantID)
		return err
	})
	return types, err
}

func (s *Service) DeleteMemberType(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		count, err := s.repo.CountMembersByType(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if count > 0 {
			return domain.ErrMemberTypeInUse
		}
		ok, err := s.repo.DeleteMemberType(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrMemberTypeNotFound
		}
		return nil
	})
}
