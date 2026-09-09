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
	SoftDeleteClass(ctx context.Context, tenantID, id uuid.UUID) error
	CountEnrollmentsForClass(ctx context.Context, tenantID, id uuid.UUID) (int64, error)
	CountTeachingAssignmentsForClass(ctx context.Context, tenantID, id uuid.UUID) (int64, error)

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
	var class domain.Class
	err := s.withTx(ctx, c.TenantID, func(ctx context.Context) error {
		var err error
		class, err = s.repo.CreateClass(ctx, c)
		return mapUniqueViolation(err, domain.ErrClassNameExists)
	})
	return class, err
}

func (s *Service) UpdateClass(ctx context.Context, c domain.Class) (domain.Class, error) {
	var class domain.Class
	err := s.withTx(ctx, c.TenantID, func(ctx context.Context) error {
		var err error
		class, err = s.repo.UpdateClass(ctx, c)
		return mapNotFound(mapUniqueViolation(err, domain.ErrClassNameExists), domain.ErrClassNotFound)
	})
	return class, err
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
		if _, err := s.repo.GetActiveEnrollment(ctx, tenantID, yearID, studentID); err == nil {
			return domain.ErrEnrollmentExists
		}
		var err error
		enrollment, err = s.repo.CreateEnrollment(ctx, tenantID, yearID, studentID, classID, joinedOn)
		return err
	})
	return enrollment, err
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
		for _, studentID := range studentIDs {
			if _, err := s.repo.GetActiveEnrollment(ctx, tenantID, yearID, studentID); err == nil {
				skipped = append(skipped, studentID)
				continue
			}
			enrollment, err := s.repo.CreateEnrollment(ctx, tenantID, yearID, studentID, classID, joinedOn)
			if err != nil {
				return err
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
