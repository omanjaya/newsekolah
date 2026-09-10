package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
)

func (s *Service) ListExtracurriculars(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]domain.Extracurricular, error) {
	var out []domain.Extracurricular
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListExtracurriculars(ctx, tenantID, yearID, includeInactive)
		return err
	})
	return out, err
}

func (s *Service) GetExtracurricular(ctx context.Context, tenantID, id uuid.UUID) (domain.Extracurricular, error) {
	var out domain.Extracurricular
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		club, ok, err := s.repo.GetExtracurricular(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrClubNotFound
		}
		out = club
		return nil
	})
	return out, err
}

// ExtracurricularInput is the create/update form for a club.
type ExtracurricularInput struct {
	Name         string
	Description  string
	CoachUserID  uuid.NullUUID
	Capacity     *int
	MeetingDay   *int16
	MeetingStart *string
	MeetingEnd   *string
	Location     string
	IsActive     bool
}

func (in ExtracurricularInput) validate() error {
	if strings.TrimSpace(in.Name) == "" {
		return domain.ErrInvalidInput
	}
	if in.Capacity != nil && *in.Capacity <= 0 {
		return domain.ErrInvalidInput
	}
	if in.MeetingDay != nil && (*in.MeetingDay < 0 || *in.MeetingDay > 6) {
		return domain.ErrInvalidInput
	}
	return nil
}

func (s *Service) CreateExtracurricular(ctx context.Context, tenantID uuid.UUID, in ExtracurricularInput) (domain.Extracurricular, error) {
	if err := in.validate(); err != nil {
		return domain.Extracurricular{}, err
	}
	var out domain.Extracurricular
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.CreateExtracurricular(ctx, domain.Extracurricular{
			TenantID: tenantID, AcademicYearID: yearID, Name: strings.TrimSpace(in.Name), Description: in.Description,
			CoachUserID: in.CoachUserID, Capacity: in.Capacity, MeetingDay: in.MeetingDay, MeetingStart: in.MeetingStart,
			MeetingEnd: in.MeetingEnd, Location: in.Location, IsActive: true,
		})
		return err
	})
	return out, err
}

func (s *Service) UpdateExtracurricular(ctx context.Context, tenantID, id uuid.UUID, in ExtracurricularInput) (domain.Extracurricular, error) {
	if err := in.validate(); err != nil {
		return domain.Extracurricular{}, err
	}
	var out domain.Extracurricular
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetExtracurricular(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrClubNotFound
		}
		current.Name, current.Description = strings.TrimSpace(in.Name), in.Description
		current.CoachUserID, current.Capacity = in.CoachUserID, in.Capacity
		current.MeetingDay, current.MeetingStart, current.MeetingEnd = in.MeetingDay, in.MeetingStart, in.MeetingEnd
		current.Location, current.IsActive = in.Location, in.IsActive
		out, err = s.repo.UpdateExtracurricular(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) DeleteExtracurricular(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteExtracurricular(ctx, tenantID, id)
	})
}

// JoinClub enrolls a student, enforcing the club's seat capacity and the
// tenant's per-student club limit; both checks and the insert happen in
// one transaction so a race between two joins cannot both succeed past a
// limit. A unique index on the database side is the final backstop
// against a concurrent duplicate active membership.
func (s *Service) JoinClub(ctx context.Context, tenantID, clubID, studentID uuid.UUID, joinedOn time.Time) (domain.Membership, error) {
	if joinedOn.IsZero() {
		return domain.Membership{}, domain.ErrInvalidInput
	}
	var out domain.Membership
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		club, ok, err := s.repo.GetExtracurricular(ctx, tenantID, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrClubNotFound
		}
		if !club.IsActive {
			return domain.ErrClubInactive
		}

		if _, exists, err := s.repo.GetActiveMembership(ctx, tenantID, clubID, studentID); err != nil {
			return err
		} else if exists {
			return domain.ErrAlreadyMember
		}

		activeMembers, err := s.repo.CountActiveMembers(ctx, tenantID, clubID)
		if err != nil {
			return err
		}
		if !club.HasRoom(activeMembers) {
			return domain.ErrClubFull
		}

		policy, err := s.loadMembershipPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		clubCount, err := s.repo.CountActiveClubsForStudent(ctx, tenantID, club.AcademicYearID, studentID)
		if err != nil {
			return err
		}
		if !policy.AllowsAnotherClub(clubCount) {
			return domain.ErrClubLimitReached
		}

		out, err = s.repo.CreateMembership(ctx, domain.Membership{
			TenantID: tenantID, ExtracurricularID: clubID, StudentUserID: studentID, JoinedOn: joinedOn, Status: domain.MembershipActive,
		})
		return err
	})
	return out, err
}

// LeaveClub ends a student's active membership as of leftOn.
func (s *Service) LeaveClub(ctx context.Context, tenantID, membershipID uuid.UUID, leftOn time.Time) (domain.Membership, error) {
	if leftOn.IsZero() {
		return domain.Membership{}, domain.ErrInvalidInput
	}
	var out domain.Membership
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetMembership(ctx, tenantID, membershipID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrMembershipNotFound
		}
		if !current.IsActive() {
			return domain.ErrMembershipNotActive
		}
		if leftOn.Before(current.JoinedOn) {
			return domain.ErrInvalidInput
		}
		result, found, err := s.repo.EndMembership(ctx, tenantID, membershipID, leftOn)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMembershipNotActive
		}
		out = result
		return nil
	})
	return out, err
}

// ListMembers lists a club's roster; includeLeft also returns past stints,
// used by the membership-during-a-term report.
func (s *Service) ListMembers(ctx context.Context, tenantID, clubID uuid.UUID, includeLeft bool) ([]domain.Membership, error) {
	var out []domain.Membership
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListMembershipsForClub(ctx, tenantID, clubID, includeLeft)
		return err
	})
	return out, err
}

// ListMyClubs is a student's own membership history across every club.
func (s *Service) ListMyClubs(ctx context.Context, tenantID, studentID uuid.UUID) ([]StudentMembership, error) {
	var out []StudentMembership
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListMembershipsForStudent(ctx, tenantID, studentID)
		return err
	})
	return out, err
}

// MembershipReport lists every membership stint of a club that overlapped
// [from, to], answering "who was a member during this term" -- not the
// same question as "who is a member right now".
func (s *Service) MembershipReport(ctx context.Context, tenantID, clubID uuid.UUID, from, to time.Time) ([]domain.Membership, error) {
	all, err := s.ListMembers(ctx, tenantID, clubID, true)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Membership, 0, len(all))
	for _, m := range all {
		if m.ActiveDuringPeriod(from, to) {
			out = append(out, m)
		}
	}
	return out, nil
}
