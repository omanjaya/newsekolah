package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// ListDutyAssignments lists assignments for one academic year, optionally
// narrowed to a duty type or user.
func (s *Service) ListDutyAssignments(ctx context.Context, tenantID, academicYearID uuid.UUID, dutyTypeID, userID uuid.NullUUID) ([]DutyAssignmentRecord, error) {
	var records []DutyAssignmentRecord
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		records, err = s.repo.ListDutyAssignments(ctx, tenantID, academicYearID, dutyTypeID, userID)
		if err != nil {
			return fmt.Errorf("list duty assignments: %w", err)
		}
		return nil
	})
	return records, err
}

// CreateDutyAssignment assigns dutyTypeID to userID for one academic year,
// with the scope object required by the duty type's scope kind (a class
// for "class", a student for "student", neither for "school").
func (s *Service) CreateDutyAssignment(ctx context.Context, tenantID uuid.UUID, in DutyAssignmentRecord) (DutyAssignmentRecord, error) {
	var record DutyAssignmentRecord
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		dutyType, err := s.repo.GetDutyTypeByID(ctx, tenantID, in.DutyTypeID)
		if err != nil {
			return domain.ErrDutyTypeNotFound
		}

		if err := domain.ValidateDutyAssignment(domain.DutyAssignmentInput{
			ScopeKind: dutyType.ScopeKind, ScopeClassID: in.ScopeClassID, ScopeStudentID: in.ScopeStudentID,
			StartsOn: in.StartsOn, EndsOn: in.EndsOn,
		}); err != nil {
			return err
		}
		if err := s.checkScopeTargetsExist(ctx, tenantID, in); err != nil {
			return err
		}
		if exists, err := s.repo.UserExists(ctx, tenantID, in.UserID); err != nil {
			return fmt.Errorf("check assignee exists: %w", err)
		} else if !exists {
			return domain.ErrScopeTargetNotFound
		}

		in.DutySlug, in.DutyName = dutyType.Slug, dutyType.Name
		created, err := s.repo.CreateDutyAssignmentRecord(ctx, tenantID, in)
		if err != nil {
			return fmt.Errorf("create duty assignment: %w", err)
		}
		if err := audit.Record(ctx, tenantID, "duty_assignment.create", "duty_assignment", created.ID, nil, created); err != nil {
			return err
		}
		record = created
		return nil
	})
	return record, err
}

func (s *Service) checkScopeTargetsExist(ctx context.Context, tenantID uuid.UUID, in DutyAssignmentRecord) error {
	if in.ScopeClassID.Valid {
		exists, err := s.repo.ClassExists(ctx, tenantID, in.ScopeClassID.UUID)
		if err != nil {
			return fmt.Errorf("check class exists: %w", err)
		}
		if !exists {
			return domain.ErrScopeTargetNotFound
		}
	}
	if in.ScopeStudentID.Valid {
		exists, err := s.repo.UserExists(ctx, tenantID, in.ScopeStudentID.UUID)
		if err != nil {
			return fmt.Errorf("check student exists: %w", err)
		}
		if !exists {
			return domain.ErrScopeTargetNotFound
		}
	}
	return nil
}

// UpdateDutyAssignment toggles is_active and/or sets an end date, e.g. to
// end a duty early.
func (s *Service) UpdateDutyAssignment(ctx context.Context, tenantID, id uuid.UUID, isActive bool, endsOn *time.Time) (DutyAssignmentRecord, error) {
	var record DutyAssignmentRecord
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetDutyAssignmentByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrDutyAssignmentNotFound
		}
		if endsOn != nil && endsOn.Before(before.StartsOn) {
			return domain.ErrInvalidScopeKind
		}
		if err := s.repo.UpdateDutyAssignmentRecord(ctx, tenantID, id, isActive, endsOn); err != nil {
			return fmt.Errorf("update duty assignment: %w", err)
		}
		after := before
		after.IsActive, after.EndsOn = isActive, endsOn
		if err := audit.Record(ctx, tenantID, "duty_assignment.update", "duty_assignment", id, before, after); err != nil {
			return err
		}
		record = after
		return nil
	})
	return record, err
}

// DeleteDutyAssignment removes an assignment outright (used for a
// same-day correction; ending it in the future should use
// UpdateDutyAssignment's ends_on instead).
func (s *Service) DeleteDutyAssignment(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetDutyAssignmentByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrDutyAssignmentNotFound
		}
		if err := s.repo.DeleteDutyAssignmentRecord(ctx, tenantID, id); err != nil {
			return fmt.Errorf("delete duty assignment: %w", err)
		}
		return audit.Record(ctx, tenantID, "duty_assignment.delete", "duty_assignment", id, before, nil)
	})
}
