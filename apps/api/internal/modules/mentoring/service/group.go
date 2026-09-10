package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
)

type GroupInput struct {
	MentorUserID uuid.UUID
	Name         string
}

func (in GroupInput) validate() error {
	if in.MentorUserID == uuid.Nil || strings.TrimSpace(in.Name) == "" {
		return domain.ErrInvalidInput
	}
	return nil
}

func (s *Service) CreateGroup(ctx context.Context, tenantID uuid.UUID, in GroupInput) (domain.MentorGroup, error) {
	if err := in.validate(); err != nil {
		return domain.MentorGroup{}, err
	}
	var out domain.MentorGroup
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.CreateGroup(ctx, domain.MentorGroup{
			TenantID: tenantID, AcademicYearID: yearID, MentorUserID: in.MentorUserID, Name: strings.TrimSpace(in.Name),
		})
		return err
	})
	return out, err
}

func (s *Service) UpdateGroup(ctx context.Context, tenantID, id uuid.UUID, in GroupInput) (domain.MentorGroup, error) {
	if err := in.validate(); err != nil {
		return domain.MentorGroup{}, err
	}
	var out domain.MentorGroup
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		current, ok, err := s.repo.GetGroup(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrGroupNotFound
		}
		current.Name, current.MentorUserID = strings.TrimSpace(in.Name), in.MentorUserID
		out, err = s.repo.UpdateGroup(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) DeleteGroup(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		if _, ok, err := s.repo.GetGroup(ctx, tenantID, id); err != nil {
			return err
		} else if !ok {
			return domain.ErrGroupNotFound
		}
		return s.repo.DeleteGroup(ctx, tenantID, id)
	})
}

func (s *Service) GetGroup(ctx context.Context, tenantID, id uuid.UUID) (domain.MentorGroup, error) {
	var out domain.MentorGroup
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		group, ok, err := s.repo.GetGroup(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrGroupNotFound
		}
		out = group
		return nil
	})
	return out, err
}

func (s *Service) ListGroupsForMentor(ctx context.Context, tenantID, mentorUserID uuid.UUID) ([]domain.MentorGroup, error) {
	var out []domain.MentorGroup
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListGroupsForMentor(ctx, tenantID, yearID, mentorUserID)
		return err
	})
	return out, err
}

func (s *Service) ListGroupsForYear(ctx context.Context, tenantID uuid.UUID) ([]domain.MentorGroup, error) {
	var out []domain.MentorGroup
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListGroupsForYear(ctx, tenantID, yearID)
		return err
	})
	return out, err
}

// AssignStudent adds a student to a group, refusing when the group is
// already at its tenant's size limit or the student already belongs to a
// group this academic year.
func (s *Service) AssignStudent(ctx context.Context, tenantID, groupID, studentUserID uuid.UUID) (domain.GroupMember, error) {
	var out domain.GroupMember
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		group, ok, err := s.repo.GetGroup(ctx, tenantID, groupID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrGroupNotFound
		}

		if _, found, err := s.repo.FindMembershipForStudent(ctx, tenantID, group.AcademicYearID, studentUserID); err != nil {
			return err
		} else if found {
			return domain.ErrMemberAlreadyInGroup
		}

		limit, err := s.groupSizeLimit(ctx, tenantID)
		if err != nil {
			return err
		}
		current, err := s.repo.CountGroupMembers(ctx, tenantID, groupID)
		if err != nil {
			return err
		}
		if !domain.CanAddMember(current, limit) {
			return domain.ErrGroupFull
		}

		out, err = s.repo.AddGroupMember(ctx, tenantID, group.AcademicYearID, domain.GroupMember{
			GroupID: groupID, StudentUserID: studentUserID,
		})
		return err
	})
	return out, err
}

func (s *Service) RemoveStudent(ctx context.Context, tenantID, groupID, studentUserID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		return s.repo.RemoveGroupMember(ctx, tenantID, groupID, studentUserID)
	})
}

func (s *Service) ListMembers(ctx context.Context, tenantID, groupID uuid.UUID) ([]domain.GroupMember, error) {
	var out []domain.GroupMember
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListGroupMembers(ctx, tenantID, groupID)
		return err
	})
	return out, err
}
