package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

type teachingRepository interface {
	CreateTeachingAssignment(ctx context.Context, a domain.TeachingAssignment) (domain.TeachingAssignment, error)
	GetTeachingAssignmentByID(ctx context.Context, tenantID, id uuid.UUID) (domain.TeachingAssignment, error)
	UpdateTeachingAssignment(ctx context.Context, tenantID, id uuid.UUID, isActive bool) (domain.TeachingAssignment, error)
	DeleteTeachingAssignment(ctx context.Context, tenantID, id uuid.UUID) error
	DeleteTeachingAssignmentsForTeacherInYear(ctx context.Context, tenantID, yearID, teacherID uuid.UUID) error
	ListTeachingAssignments(ctx context.Context, tenantID, yearID uuid.UUID, teacherID, classID *uuid.UUID, page Page) ([]domain.TeachingAssignment, int64, error)
	ListTeachingAssignmentsByTeacher(ctx context.Context, tenantID, yearID, teacherID uuid.UUID) ([]domain.TeachingAssignment, error)
	TeacherHasAssignment(ctx context.Context, tenantID, yearID, teacherID, subjectID, classID uuid.UUID) (bool, error)
	IsActiveTeacher(ctx context.Context, tenantID, userID uuid.UUID) (bool, error)
	SubjectOfferedInYear(ctx context.Context, tenantID, yearID, subjectID uuid.UUID) (bool, error)
	GetClassByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Class, error)
}

// maxTeachingAssignmentClasses mirrors the old app's cap (academic_scope.go,
// validTeacherSubjectAssignmentInput): a bulk sync request carrying more
// classes than one teacher can plausibly teach is almost certainly a bad
// request, not a legitimate large tenant.
const maxTeachingAssignmentClasses = 100

// requireValidTeachingReferences checks that the teacher is an active
// teacher, the subject is actually offered in yearID, and classID belongs
// to yearID -- the old app's validTeacherSubjectReferences check, which the
// new schema's plain foreign keys (teaching_assignments.subject_id ->
// subjects, .class_id -> classes) cannot enforce on their own since
// subjects are tenant-wide and a class can belong to any year.
func (s *Service) requireValidTeachingReferences(ctx context.Context, tenantID, yearID, teacherID, subjectID, classID uuid.UUID) error {
	ok, err := s.repo.IsActiveTeacher(ctx, tenantID, teacherID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrTeacherNotActive
	}
	ok, err = s.repo.SubjectOfferedInYear(ctx, tenantID, yearID, subjectID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrSubjectNotOfferedInYear
	}
	class, err := s.repo.GetClassByID(ctx, tenantID, classID)
	if err != nil {
		return mapNotFound(err, domain.ErrClassNotFound)
	}
	if class.AcademicYearID != yearID {
		return domain.ErrClassYearMismatch
	}
	return nil
}

func (s *Service) ListTeachingAssignments(ctx context.Context, tenantID, yearID uuid.UUID, teacherID, classID *uuid.UUID, page Page) ([]domain.TeachingAssignment, int64, error) {
	page = normalizePage(page)
	var (
		assignments []domain.TeachingAssignment
		total       int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		assignments, total, err = s.repo.ListTeachingAssignments(ctx, tenantID, yearID, teacherID, classID, page)
		return err
	})
	return assignments, total, err
}

func (s *Service) CreateTeachingAssignment(ctx context.Context, a domain.TeachingAssignment) (domain.TeachingAssignment, error) {
	var assignment domain.TeachingAssignment
	err := s.withTx(ctx, a.TenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, a.TenantID, a.AcademicYearID); err != nil {
			return err
		}
		if err := s.requireValidTeachingReferences(ctx, a.TenantID, a.AcademicYearID, a.TeacherUserID, a.SubjectID, a.ClassID); err != nil {
			return err
		}
		var err error
		assignment, err = s.repo.CreateTeachingAssignment(ctx, a)
		return mapUniqueViolation(err, domain.ErrTeachingAssignmentExists)
	})
	return assignment, err
}

func (s *Service) UpdateTeachingAssignment(ctx context.Context, tenantID, id uuid.UUID, isActive bool) (domain.TeachingAssignment, error) {
	var assignment domain.TeachingAssignment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		assignment, err = s.repo.UpdateTeachingAssignment(ctx, tenantID, id, isActive)
		return mapNotFound(err, domain.ErrTeachingAssignmentNotFound)
	})
	return assignment, err
}

func (s *Service) DeleteTeachingAssignment(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteTeachingAssignment(ctx, tenantID, id)
	})
}

// SyncTeacherAssignments replaces every assignment a teacher has in one
// academic year with exactly the given (subject, class) pairs: it deletes
// the teacher's current assignments and re-creates the requested ones, in
// one transaction, so a bulk edit in the UI ("this teacher now teaches
// these five classes") is one call instead of a diff the client has to
// compute.
func (s *Service) SyncTeacherAssignments(ctx context.Context, tenantID, yearID, teacherID uuid.UUID, pairs []SubjectClassPair) ([]domain.TeachingAssignment, error) {
	if len(pairs) > maxTeachingAssignmentClasses {
		return nil, domain.ErrTooManyClasses
	}
	created := make([]domain.TeachingAssignment, 0, len(pairs))
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireYearNotArchived(ctx, tenantID, yearID); err != nil {
			return err
		}
		ok, err := s.repo.IsActiveTeacher(ctx, tenantID, teacherID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrTeacherNotActive
		}
		for _, pair := range pairs {
			if err := s.requireValidTeachingReferences(ctx, tenantID, yearID, teacherID, pair.SubjectID, pair.ClassID); err != nil {
				return err
			}
		}
		if err := s.repo.DeleteTeachingAssignmentsForTeacherInYear(ctx, tenantID, yearID, teacherID); err != nil {
			return err
		}
		for _, pair := range pairs {
			assignment, err := s.repo.CreateTeachingAssignment(ctx, domain.TeachingAssignment{
				TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID,
				SubjectID: pair.SubjectID, ClassID: pair.ClassID, IsActive: true,
			})
			if err != nil {
				return err
			}
			created = append(created, assignment)
		}
		return nil
	})
	return created, err
}

// SubjectClassPair is one (subject, class) pairing a teacher is assigned
// to, used by SyncTeacherAssignments.
type SubjectClassPair struct {
	SubjectID uuid.UUID
	ClassID   uuid.UUID
}

// RequireTeachingAssignment implements the module's "teacher must have a
// teaching assignment before scheduling" rule: other modules (scheduling)
// call this before creating a teaching schedule entry.
func (s *Service) RequireTeachingAssignment(ctx context.Context, tenantID, yearID, teacherID, subjectID, classID uuid.UUID) error {
	var ok bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		ok, err = s.repo.TeacherHasAssignment(ctx, tenantID, yearID, teacherID, subjectID, classID)
		return err
	})
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrTeacherNotAssigned
	}
	return nil
}
