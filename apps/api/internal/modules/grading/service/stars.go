package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

type StarInput struct {
	StudentUserID    uuid.UUID
	ClassID          uuid.UUID
	SubjectID        uuid.NullUUID
	Delta            int
	Note             string
	VisibleToStudent bool
}

// GiveStar records one classroom-star adjustment. It restores four rules
// the old app enforced (grading_extended.go:539-572, 585) that the rebuild
// had dropped: the amount is 1-999 and the note at most 255 characters
// (domain.ValidateStar), the student must be an active member of the
// class, the caller must teach that class-subject unless canManageAny,
// and a per-student advisory lock serializes concurrent balance reads so
// two simultaneous deductions cannot both pass the "stays >= 0" check and
// leave the ledger negative.
func (s *Service) GiveStar(ctx context.Context, tenantID, teacherID uuid.UUID, canManageAny bool, in StarInput) (domain.StarEvent, int, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.StarEvent{}, 0, err
	}
	if err := domain.ValidateStar(in.Delta, in.Note); err != nil {
		return domain.StarEvent{}, 0, err
	}
	var (
		event   domain.StarEvent
		balance int
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if in.SubjectID.Valid {
			if err := s.requireTeaches(ctx, tenantID, yearID, teacherID, in.ClassID, in.SubjectID.UUID, canManageAny); err != nil {
				return err
			}
		} else if !canManageAny {
			// Without a subject there is no teaching assignment to check
			// against, so only a curriculum lead or admin may award a
			// class-wide star.
			return domain.ErrNotTeachingThisClass
		}
		members, err := s.classMemberSet(ctx, tenantID, yearID, in.ClassID)
		if err != nil {
			return err
		}
		if !members[in.StudentUserID] {
			return domain.ErrStudentNotInClass
		}
		if err := s.repo.LockStarBalance(ctx, tenantID, in.StudentUserID); err != nil {
			return err
		}
		current, err := s.repo.StarBalance(ctx, tenantID, yearID, in.StudentUserID)
		if err != nil {
			return err
		}
		balance, err = domain.ApplyStar(current, in.Delta)
		if err != nil {
			return err
		}
		event, err = s.repo.InsertStarEvent(ctx, domain.StarEvent{
			TenantID: tenantID, AcademicYearID: yearID, ClassID: in.ClassID, SubjectID: in.SubjectID,
			StudentUserID: in.StudentUserID, TeacherUserID: teacherID, Delta: in.Delta, Note: in.Note, VisibleToStudent: in.VisibleToStudent,
		})
		return err
	})
	return event, balance, err
}

// StarLedger requires the caller to teach the student's current class in
// some subject, unless canManageAny -- otherwise any teacher holding
// manage_grades could read any student's full ledger by ID.
func (s *Service) StarLedger(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, studentID uuid.UUID, includeHidden bool, limit int) ([]domain.StarEvent, int, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var (
		events  []domain.StarEvent
		balance int
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if !canManageAny {
			classID, err := s.repo.StudentClassID(ctx, tenantID, yearID, studentID)
			if err != nil {
				return err
			}
			if !classID.Valid {
				return domain.ErrNotTeachingThisClass
			}
			if err := s.requireTeachesClass(ctx, tenantID, yearID, actorID, classID.UUID, canManageAny); err != nil {
				return err
			}
		}
		if events, err = s.repo.ListStarEvents(ctx, tenantID, yearID, studentID, includeHidden, limit); err != nil {
			return err
		}
		balance, err = s.repo.StarBalance(ctx, tenantID, yearID, studentID)
		return err
	})
	return events, balance, err
}

// ClassStarBalances requires the caller to teach the class in some
// subject, unless canManageAny.
func (s *Service) ClassStarBalances(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID uuid.UUID) ([]StarBalance, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []StarBalance
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if err := s.requireTeachesClass(ctx, tenantID, yearID, actorID, classID, canManageAny); err != nil {
			return err
		}
		out, err = s.repo.ListStarBalances(ctx, tenantID, yearID, classID)
		return err
	})
	return out, err
}

// MyStars is the student's own star breakdown, grouped by subject and
// teacher, counting only events the teacher marked visible to the student
// (grading_extended.go:640-669's myStars).
func (s *Service) MyStars(ctx context.Context, tenantID, studentID uuid.UUID) ([]MyStarGroup, int, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, 0, err
	}
	var groups []MyStarGroup
	total := 0
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		groups, err = s.repo.MyStarsGrouped(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		for _, g := range groups {
			total += g.Total
		}
		return nil
	})
	return groups, total, err
}
