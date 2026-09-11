package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// maxMemberNoRetries mirrors the old app's retry budget for a member_no
// collision (library_common.go:596-614).
const maxMemberNoRetries = 5

// resolveOrRegisterMember returns userID's library_members row, creating
// one on the fly when auto_register_members is on and the borrow is that
// member's first (old app: library_members.go:606-615).
func (s *Service) resolveOrRegisterMember(ctx context.Context, tenantID, userID uuid.UUID, policy domain.Policy, now time.Time) (domain.Member, error) {
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
	return s.autoRegisterMember(ctx, tenantID, userID, policy, now)
}

func (s *Service) autoRegisterMember(ctx context.Context, tenantID, userID uuid.UUID, policy domain.Policy, now time.Time) (domain.Member, error) {
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
	return s.createMemberWithGeneratedNo(ctx, tenantID, userID, memberType, policy, now)
}

func (s *Service) createMemberWithGeneratedNo(ctx context.Context, tenantID, userID uuid.UUID, memberType domain.MemberType, policy domain.Policy, now time.Time) (domain.Member, error) {
	count, err := s.repo.CountMembersByType(ctx, tenantID, memberType.ID)
	if err != nil {
		return domain.Member{}, err
	}
	validUntil := domain.ValidUntilFromRegistration(now, memberType.ValidityMonths)
	var lastErr error
	for attempt := 0; attempt < maxMemberNoRetries; attempt++ {
		memberNo := domain.GenerateMemberNo(policy.MemberNoFormat, now.Year(), count+1+attempt)
		member, err := s.repo.CreateMember(ctx, domain.Member{
			UserID: userID, TenantID: tenantID, MemberNo: memberNo, MemberTypeID: memberType.ID,
			RegisteredOn: now, ValidUntil: &validUntil, Status: domain.MemberActive,
		})
		if err == nil {
			return member, nil
		}
		if errors.Is(err, domain.ErrMemberAlreadyExists) {
			return domain.Member{}, err
		}
		lastErr = err
	}
	_ = lastErr
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
		now := s.clock.Now()
		if in.MemberNo == "" {
			member, err = s.createMemberWithGeneratedNo(ctx, tenantID, in.UserID, memberType, policy, now)
			if err != nil {
				return err
			}
			if in.Notes != "" {
				member, _, err = s.repo.UpdateMemberProfile(ctx, tenantID, in.UserID, memberType.ID, member.ValidUntil, in.Notes)
			}
			return err
		}
		validUntil := domain.ValidUntilFromRegistration(now, memberType.ValidityMonths)
		member, err = s.repo.CreateMember(ctx, domain.Member{
			UserID: in.UserID, TenantID: tenantID, MemberNo: in.MemberNo, MemberTypeID: memberType.ID,
			RegisteredOn: now, ValidUntil: &validUntil, Status: domain.MemberActive, Notes: in.Notes,
		})
		return err
	})
	return member, err
}

// BulkRegisterResult is BulkRegisterByRole's outcome.
type BulkRegisterResult struct {
	Registered []domain.Member
	Failed     []RejectedBarcode // Barcode reused as the user id string; Reason is the error
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
		now := s.clock.Now()
		for _, c := range candidates {
			member, err := s.createMemberWithGeneratedNo(ctx, tenantID, c.UserID, memberType, policy, now)
			if err != nil {
				result.Failed = append(result.Failed, RejectedBarcode{Barcode: c.UserID.String(), Reason: err.Error()})
				continue
			}
			result.Registered = append(result.Registered, member)
		}
		return nil
	})
	return result, err
}

func (s *Service) GetMember(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, error) {
	member, found, err := s.repo.GetMember(ctx, tenantID, userID)
	if err != nil {
		return domain.Member{}, err
	}
	if !found {
		return domain.Member{}, domain.ErrMemberNotFound
	}
	return member, nil
}

// ListMembersInput narrows ListMembers.
type ListMembersInput struct {
	Status       string
	MemberTypeID uuid.NullUUID
	Search       string
	Limit        int
	Offset       int
}

func (s *Service) ListMembers(ctx context.Context, tenantID uuid.UUID, in ListMembersInput) ([]domain.Member, error) {
	return s.repo.ListMembers(ctx, tenantID, MemberListFilter{Status: in.Status, MemberTypeID: in.MemberTypeID, Search: in.Search}, clampLimit(in.Limit), in.Offset)
}

// UpdateMemberStatus lets staff move a member between statuses directly
// (e.g. reactivate, deactivate); suspension from a late return is set by
// the return flow itself, not this endpoint.
func (s *Service) UpdateMemberStatus(ctx context.Context, tenantID, userID uuid.UUID, status domain.MemberStatus) (domain.Member, error) {
	if !status.Valid() {
		return domain.Member{}, domain.ErrInvalidInput
	}
	member, found, err := s.repo.UpdateMemberStatus(ctx, tenantID, userID, status, nil)
	if err != nil {
		return domain.Member{}, err
	}
	if !found {
		return domain.Member{}, domain.ErrMemberNotFound
	}
	return member, nil
}

func (s *Service) UpdateMemberProfile(ctx context.Context, tenantID, userID, memberTypeID uuid.UUID, validUntil *time.Time, notes string) (domain.Member, error) {
	member, found, err := s.repo.UpdateMemberProfile(ctx, tenantID, userID, memberTypeID, validUntil, notes)
	if err != nil {
		return domain.Member{}, err
	}
	if !found {
		return domain.Member{}, domain.ErrMemberNotFound
	}
	return member, nil
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
	if err := t.Validate(); err != nil {
		return domain.MemberType{}, err
	}
	return s.repo.CreateMemberType(ctx, t)
}

func (s *Service) UpdateMemberType(ctx context.Context, tenantID uuid.UUID, t domain.MemberType) (domain.MemberType, error) {
	t.TenantID = tenantID
	if err := t.Validate(); err != nil {
		return domain.MemberType{}, err
	}
	return s.repo.UpdateMemberType(ctx, t)
}

func (s *Service) ListMemberTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MemberType, error) {
	return s.repo.ListMemberTypes(ctx, tenantID)
}

func (s *Service) DeleteMemberType(ctx context.Context, tenantID, id uuid.UUID) error {
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
}
