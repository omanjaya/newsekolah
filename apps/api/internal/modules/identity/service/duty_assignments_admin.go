package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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
		if err := s.requireSingleHomeroom(ctx, tenantID, dutyType.Slug, dutyType.ID, in); err != nil {
			return err
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

// endActiveHomeroomAssignment ends every active "homeroom" duty
// assignment of the class (except in.ID, the row being reactivated) before
// a new holder takes over -- mirroring academic/service.syncHomeroomDuty,
// which does the same when classes.homeroom_teacher_id is edited directly.
// It ends all of them, not just one, so a class left with two active
// holders by older code heals on the next change.
func (s *Service) endActiveHomeroomAssignment(ctx context.Context, tenantID uuid.UUID, dutyType DutyTypeRecord, in DutyAssignmentRecord) error {
	if dutyType.Slug != homeroomDutySlug || !in.ScopeClassID.Valid {
		return nil
	}
	keep := uuid.NullUUID{UUID: in.ID, Valid: in.ID != uuid.Nil}
	if err := s.repo.EndActiveAssignmentsForClass(ctx, tenantID, in.AcademicYearID, dutyType.ID, in.ScopeClassID.UUID, keep, in.StartsOn); err != nil {
		return fmt.Errorf("end previous homeroom assignment: %w", err)
	}
	return nil
}

// requireSingleHomeroom refuses making in.UserID homeroom teacher of a
// second class in the same academic year: attendance, permits and the
// homeroom pages each resolve a teacher to one class.
func (s *Service) requireSingleHomeroom(ctx context.Context, tenantID uuid.UUID, dutySlug string, dutyTypeID uuid.UUID, in DutyAssignmentRecord) error {
	if dutySlug != homeroomDutySlug || !in.ScopeClassID.Valid {
		return nil
	}
	other, err := s.repo.HoldsDutyForOtherClass(ctx, tenantID, in.AcademicYearID, dutyTypeID, in.UserID, in.ScopeClassID.UUID)
	if err != nil {
		return err
	}
	if other {
		return domain.ErrTeacherAlreadyHomeroom
	}
	return nil
}

// resyncClassHomeroom points classes.homeroom_teacher_id at whoever still
// holds the class's homeroom duty after one holder was ended or deleted,
// or clears it when nobody does -- instead of always clearing it, which
// left the class "without a homeroom teacher" while another active holder
// remained.
func (s *Service) resyncClassHomeroom(ctx context.Context, tenantID uuid.UUID, record DutyAssignmentRecord) error {
	if record.DutySlug != homeroomDutySlug || !record.ScopeClassID.Valid {
		return nil
	}
	holder, found, err := s.repo.FindActiveHolderForClass(ctx, tenantID, record.AcademicYearID, record.DutyTypeID, record.ScopeClassID.UUID)
	if err != nil {
		return err
	}
	return s.syncClassHomeroom(ctx, tenantID, record.DutySlug, record.ScopeClassID, uuid.NullUUID{UUID: holder, Valid: found})
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
		reactivating := !before.IsActive && isActive
		if reactivating {
			// Reactivating a homeroom row makes its holder the class's
			// homeroom teacher again: the same rules as a new assignment.
			if err := s.requireSingleHomeroom(ctx, tenantID, before.DutySlug, before.DutyTypeID, before); err != nil {
				return err
			}
			dutyType := DutyTypeRecord{ID: before.DutyTypeID, Slug: before.DutySlug}
			// The class's other holder hands over today, not on the
			// reactivated row's original start date.
			takeover := before
			takeover.StartsOn = clock.Now(ctx, s.clock)
			if err := s.endActiveHomeroomAssignment(ctx, tenantID, dutyType, takeover); err != nil {
				return err
			}
		}
		if err := s.repo.UpdateDutyAssignmentRecord(ctx, tenantID, id, isActive, endsOn); err != nil {
			return fmt.Errorf("update duty assignment: %w", err)
		}
		after := before
		after.IsActive, after.EndsOn = isActive, endsOn
		if reactivating || (before.IsActive && !isActive) {
			// classes.homeroom_teacher_id follows whoever holds the duty
			// now: the reactivated holder, the class's other remaining
			// holder, or nobody.
			if err := s.resyncClassHomeroom(ctx, tenantID, after); err != nil {
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
			if err := s.resyncClassHomeroom(ctx, tenantID, before); err != nil {
				return fmt.Errorf("sync class homeroom teacher: %w", err)
			}
		}
		return audit.Record(ctx, tenantID, "duty_assignment.delete", "duty_assignment", id, before, nil)
	})
}
