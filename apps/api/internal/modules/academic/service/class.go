package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

type classRepository interface {
	CreateClass(ctx context.Context, c domain.Class) (domain.Class, error)
	UpdateClass(ctx context.Context, c domain.Class) (domain.Class, error)
	GetClassByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Class, error)
	ListClasses(ctx context.Context, tenantID, yearID uuid.UUID, search string, gradeLevelID *uuid.UUID, page Page) ([]domain.Class, int64, error)
	ListClassesByYearAndGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]domain.Class, error)
	ListAllClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Class, error)
	SoftDeleteClass(ctx context.Context, tenantID, id uuid.UUID) error
	CountEnrollmentsForClass(ctx context.Context, tenantID, id uuid.UUID) (int64, error)
	CountTeachingAssignmentsForClass(ctx context.Context, tenantID, id uuid.UUID) (int64, error)

	FindHomeroomDutyTypeID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
	FindActiveHomeroomAssignment(ctx context.Context, tenantID, yearID, dutyTypeID, classID uuid.UUID) (id, userID uuid.UUID, found bool, err error)
	EndHomeroomAssignment(ctx context.Context, tenantID, id uuid.UUID, endsOn time.Time) error
	CreateHomeroomAssignment(ctx context.Context, tenantID, yearID, dutyTypeID, teacherID, classID uuid.UUID, startsOn time.Time) error

	IsActiveStudent(ctx context.Context, tenantID, userID uuid.UUID) (bool, error)
	CreateEnrollment(ctx context.Context, tenantID, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (domain.Enrollment, error)
	GetActiveEnrollment(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (domain.Enrollment, error)
	GetEnrollmentByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Enrollment, error)
	CloseEnrollment(ctx context.Context, tenantID, id uuid.UUID, status string, leftOn time.Time) (domain.Enrollment, error)
	ListEnrollmentsByClass(ctx context.Context, tenantID, classID uuid.UUID, page Page) ([]domain.Enrollment, int64, error)
	ListEnrollmentsByYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Enrollment, error)
	ListEnrollmentsByYearAndGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]domain.Enrollment, error)

	ListPromotionCandidates(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.PromotionCandidate, error)
	ListClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.TargetClass, error)
}

func (s *Service) CreateClass(ctx context.Context, c domain.Class) (domain.Class, error) {
	if err := domain.ValidateMaxLength(c.Name, domain.MaxClassNameLength); err != nil {
		return domain.Class{}, err
	}
	var class domain.Class
	err := s.withTx(ctx, c.TenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, c.TenantID, c.AcademicYearID); err != nil {
			return err
		}
		var err error
		class, err = s.repo.CreateClass(ctx, c)
		if err != nil {
			return mapCheckViolation(mapUniqueViolation(err, domain.ErrClassNameExists), domain.ErrFieldTooLong)
		}
		return s.syncHomeroomDuty(ctx, class, nil, class.HomeroomTeacherID)
	})
	return class, err
}

func (s *Service) UpdateClass(ctx context.Context, c domain.Class) (domain.Class, error) {
	if err := domain.ValidateMaxLength(c.Name, domain.MaxClassNameLength); err != nil {
		return domain.Class{}, err
	}
	var class domain.Class
	err := s.withTx(ctx, c.TenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, c.TenantID, c.AcademicYearID); err != nil {
			return err
		}
		before, err := s.repo.GetClassByID(ctx, c.TenantID, c.ID)
		if err != nil {
			return mapNotFound(err, domain.ErrClassNotFound)
		}
		class, err = s.repo.UpdateClass(ctx, c)
		if err != nil {
			return mapNotFound(mapCheckViolation(mapUniqueViolation(err, domain.ErrClassNameExists), domain.ErrFieldTooLong), domain.ErrClassNotFound)
		}
		return s.syncHomeroomDuty(ctx, class, before.HomeroomTeacherID, class.HomeroomTeacherID)
	})
	return class, err
}

// syncHomeroomDuty keeps the class's "homeroom" duty assignment in step
// with classes.homeroom_teacher_id when that column is edited directly
// (through the class form) rather than through the duty assignment admin
// screen -- the reverse of identity/service.syncClassHomeroom, which
// writes this column when the duty assignment is what changed. A tenant
// that predates duty-type seeding (no "homeroom" duty type yet) is left
// alone: there is nothing to sync onto.
func (s *Service) syncHomeroomDuty(ctx context.Context, class domain.Class, before, after *uuid.UUID) error {
	changed := (before == nil) != (after == nil) || (before != nil && after != nil && *before != *after)
	if !changed {
		return nil
	}
	dutyTypeID, found, err := s.repo.FindHomeroomDutyTypeID(ctx, class.TenantID)
	if err != nil || !found {
		return err
	}
	if assignmentID, _, found, err := s.repo.FindActiveHomeroomAssignment(ctx, class.TenantID, class.AcademicYearID, dutyTypeID, class.ID); err != nil {
		return err
	} else if found {
		if err := s.repo.EndHomeroomAssignment(ctx, class.TenantID, assignmentID, s.clock.Now()); err != nil {
			return err
		}
	}
	if after != nil {
		return s.repo.CreateHomeroomAssignment(ctx, class.TenantID, class.AcademicYearID, dutyTypeID, *after, class.ID, s.clock.Now())
	}
	return nil
}

func (s *Service) GetClass(ctx context.Context, tenantID, id uuid.UUID) (domain.Class, error) {
	var class domain.Class
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		class, err = s.repo.GetClassByID(ctx, tenantID, id)
		return mapNotFound(err, domain.ErrClassNotFound)
	})
	return class, err
}

func (s *Service) ListClasses(ctx context.Context, tenantID, yearID uuid.UUID, search string, gradeLevelID *uuid.UUID, page Page) ([]domain.Class, int64, error) {
	page = normalizePage(page)
	var (
		classes []domain.Class
		total   int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		classes, total, err = s.repo.ListClasses(ctx, tenantID, yearID, search, gradeLevelID, page)
		return err
	})
	return classes, total, err
}

// DeleteClass refuses to remove a class with active enrollments or teaching
// assignments (409 ACADEMIC_HAS_DEPENDENTS).
func (s *Service) DeleteClass(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		enrollments, err := s.repo.CountEnrollmentsForClass(ctx, tenantID, id)
		if err != nil {
			return err
		}
		assignments, err := s.repo.CountTeachingAssignmentsForClass(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if enrollments > 0 || assignments > 0 {
			return domain.ErrHasDependents
		}
		return s.repo.SoftDeleteClass(ctx, tenantID, id)
	})
}

func (s *Service) GetEnrollment(ctx context.Context, tenantID, id uuid.UUID) (domain.Enrollment, error) {
	var enrollment domain.Enrollment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		enrollment, err = s.repo.GetEnrollmentByID(ctx, tenantID, id)
		return mapNotFound(err, domain.ErrEnrollmentNotOpen)
	})
	return enrollment, err
}

func (s *Service) ListEnrollmentsByClass(ctx context.Context, tenantID, classID uuid.UUID, page Page) ([]domain.Enrollment, int64, error) {
	page = normalizePage(page)
	var (
		enrollments []domain.Enrollment
		total       int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		enrollments, total, err = s.repo.ListEnrollmentsByClass(ctx, tenantID, classID, page)
		return err
	})
	return enrollments, total, err
}

func (s *Service) ListUnassignedStudents(ctx context.Context, tenantID, yearID uuid.UUID, search string, page Page) ([]StudentSummary, int64, error) {
	page = normalizePage(page)
	var (
		students []StudentSummary
		total    int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		students, total, err = s.repo.ListUnassignedStudents(ctx, tenantID, yearID, search, page)
		return err
	})
	return students, total, err
}

// AssignStudent opens a new active enrollment for a student who has none
// yet this academic year. Assigning a student who already has one fails
// with ErrEnrollmentExists; call MoveStudent to change their class
// instead.
func (s *Service) AssignStudent(ctx context.Context, tenantID, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (domain.Enrollment, error) {
	var enrollment domain.Enrollment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, tenantID, yearID); err != nil {
			return err
		}
		if err := s.requireActiveStudent(ctx, tenantID, studentID); err != nil {
			return err
		}
		if _, err := s.repo.GetActiveEnrollment(ctx, tenantID, yearID, studentID); err == nil {
			return domain.ErrEnrollmentExists
		}
		var err error
		enrollment, err = s.repo.CreateEnrollment(ctx, tenantID, yearID, studentID, classID, joinedOn)
		return mapUniqueViolation(err, domain.ErrEnrollmentExists)
	})
	return enrollment, err
}

// requireActiveStudent fails a class/enrollment mutation early when the
// given user id does not resolve to an active user with a student profile
// -- the old app rejected the same case (student_classes.go,
// studentExistsInAcademicYear), a check the enrollment table's foreign key
// alone cannot enforce since it only knows "some user", not "an active
// student".
func (s *Service) requireActiveStudent(ctx context.Context, tenantID, studentID uuid.UUID) error {
	ok, err := s.repo.IsActiveStudent(ctx, tenantID, studentID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrStudentNotActive
	}
	return nil
}

// BulkAssignStudents assigns every listed student to classID, skipping (not
// failing) any student who already has an active enrollment this year --
// bulk assignment is meant for filling an empty or partially-filled class
// from the unassigned list, not for moving students who are already
// placed.
func (s *Service) BulkAssignStudents(ctx context.Context, tenantID, yearID, classID uuid.UUID, studentIDs []uuid.UUID, joinedOn time.Time) ([]domain.Enrollment, []uuid.UUID, error) {
	assigned := make([]domain.Enrollment, 0, len(studentIDs))
	skipped := make([]uuid.UUID, 0)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, tenantID, yearID); err != nil {
			return err
		}
		for _, studentID := range studentIDs {
			if err := s.requireActiveStudent(ctx, tenantID, studentID); err != nil {
				return err
			}
			if _, err := s.repo.GetActiveEnrollment(ctx, tenantID, yearID, studentID); err == nil {
				skipped = append(skipped, studentID)
				continue
			}
			enrollment, err := s.repo.CreateEnrollment(ctx, tenantID, yearID, studentID, classID, joinedOn)
			if err != nil {
				return mapUniqueViolation(err, domain.ErrEnrollmentExists)
			}
			assigned = append(assigned, enrollment)
		}
		return nil
	})
	return assigned, skipped, err
}

// MoveStudent closes the student's current active enrollment (status
// "moved") and opens a new one in the destination class, preserving full
// history instead of updating class_id in place.
func (s *Service) MoveStudent(ctx context.Context, tenantID, yearID, studentID, toClassID uuid.UUID, effectiveOn time.Time) (domain.Enrollment, error) {
	var newEnrollment domain.Enrollment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, tenantID, yearID); err != nil {
			return err
		}
		current, err := s.repo.GetActiveEnrollment(ctx, tenantID, yearID, studentID)
		if err != nil {
			return mapNotFound(err, domain.ErrEnrollmentNotOpen)
		}
		if _, err := s.repo.CloseEnrollment(ctx, tenantID, current.ID, domain.EnrollmentStatusMoved, effectiveOn); err != nil {
			return err
		}
		newEnrollment, err = s.repo.CreateEnrollment(ctx, tenantID, yearID, studentID, toClassID, effectiveOn)
		return err
	})
	return newEnrollment, err
}

// RemoveStudent closes a student's active enrollment as "left" mid-year --
// distinct from MoveStudent (which opens a new enrollment in another
// class) and from promotion's "transfer" outcome (which closes it at
// year-end). Use this when a student leaves the school entirely before
// the year ends.
func (s *Service) RemoveStudent(ctx context.Context, tenantID, id uuid.UUID, leftOn time.Time) (domain.Enrollment, error) {
	var enrollment domain.Enrollment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.repo.GetEnrollmentByID(ctx, tenantID, id)
		if err != nil {
			return mapNotFound(err, domain.ErrEnrollmentNotOpen)
		}
		if current.Status != domain.EnrollmentStatusActive {
			return domain.ErrEnrollmentNotOpen
		}
		if err := s.requireYearNotArchived(ctx, tenantID, current.AcademicYearID); err != nil {
			return err
		}
		enrollment, err = s.repo.CloseEnrollment(ctx, tenantID, id, domain.EnrollmentStatusLeft, leftOn)
		return err
	})
	return enrollment, err
}
