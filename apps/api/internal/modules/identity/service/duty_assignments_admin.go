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
		if ok, err := s.repo.IsActiveTeacherOrStaff(ctx, tenantID, in.UserID); err != nil {
			return fmt.Errorf("check assignee is teacher or staff: %w", err)
		} else if !ok {
			return domain.ErrAssigneeNotEligible
		}
		if err := s.endActiveHomeroomAssignment(ctx, tenantID, dutyType, in); err != nil {
			return err
		}

		in.DutySlug, in.DutyName = dutyType.Slug, dutyType.Name
		created, err := s.repo.CreateDutyAssignmentRecord(ctx, tenantID, in)
		if err != nil {
			return fmt.Errorf("create duty assignment: %w", err)
		}
		if err := s.syncClassHomeroom(ctx, tenantID, dutyType.Slug, in.ScopeClassID, uuid.NullUUID{UUID: in.UserID, Valid: true}); err != nil {
			return fmt.Errorf("sync class homeroom teacher: %w", err)
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
		// The scope class must belong to the same academic year as the
		// assignment itself, not merely exist in the tenant -- otherwise a
		// homeroom duty could point at a class from a different year.
		exists, err := s.repo.ClassExistsInYear(ctx, tenantID, in.ScopeClassID.UUID, in.AcademicYearID)
		if err != nil {
			return fmt.Errorf("check class exists in year: %w", err)
		}
		if !exists {
			return domain.ErrScopeTargetNotFound
		}
	}
	if in.ScopeStudentID.Valid {
		// Consistent with the assignee eligibility check CreateDutyAssignment
		// runs via IsActiveTeacherOrStaff: a student-scope target must
		// resolve to an active user with a student profile, not merely
		// "some user exists in the tenant".
		ok, err := s.repo.IsActiveStudent(ctx, tenantID, in.ScopeStudentID.UUID)
		if err != nil {
			return fmt.Errorf("check student exists: %w", err)
		}
		if !ok {
			return domain.ErrScopeTargetNotFound
		}
	}
	return nil
}

// endActiveHomeroomAssignment ends a class's currently active "homeroom"
// duty assignment, if any, before CreateDutyAssignment creates a new one
// for the same class -- mirroring academic/service.syncHomeroomDuty, which
// does the same when classes.homeroom_teacher_id is edited directly.
// Without this, two assignments could be active for one class at once
// while homeroom_teacher_id silently points at only the newest.
func (s *Service) endActiveHomeroomAssignment(ctx context.Context, tenantID uuid.UUID, dutyType DutyTypeRecord, in DutyAssignmentRecord) error {
	if dutyType.Slug != homeroomDutySlug || !in.ScopeClassID.Valid {
		return nil
	}
	existingID, found, err := s.repo.FindActiveAssignmentForClass(ctx, tenantID, in.AcademicYearID, dutyType.ID, in.ScopeClassID.UUID)
	if err != nil {
		return fmt.Errorf("find active homeroom assignment: %w", err)
	}
	if !found {
		return nil
	}
	endsOn := in.StartsOn
	if err := s.repo.UpdateDutyAssignmentRecord(ctx, tenantID, existingID, false, &endsOn); err != nil {
		return fmt.Errorf("end previous homeroom assignment: %w", err)
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
		if before.IsActive && !isActive {
			// The homeroom teacher just lost the duty: clear the class's
			// cached homeroom_teacher_id rather than leave it pointing at
			// someone no longer holding the duty.
			if err := s.syncClassHomeroom(ctx, tenantID, before.DutySlug, before.ScopeClassID, uuid.NullUUID{}); err != nil {
				return fmt.Errorf("sync class homeroom teacher: %w", err)
			}
		}
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
		if before.IsActive {
			if err := s.syncClassHomeroom(ctx, tenantID, before.DutySlug, before.ScopeClassID, uuid.NullUUID{}); err != nil {
				return fmt.Errorf("sync class homeroom teacher: %w", err)
			}
		}
		return audit.Record(ctx, tenantID, "duty_assignment.delete", "duty_assignment", id, before, nil)
	})
}
