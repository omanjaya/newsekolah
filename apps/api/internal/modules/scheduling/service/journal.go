package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// JournalInput is what a caller supplies to create or update a class
// journal.
type JournalInput struct {
	AcademicYearID uuid.UUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	LessonDate     time.Time
	Topic          string
	Activities     string
	Reflection     string
}

// UpsertJournal creates or updates the journal for
// (teacherUserID, class, subject, lessonDate). writerUserID is the actual
// author -- the teacher themselves, or their accepted substitute for that
// date -- while teacherUserID stays the schedule's own teacher, per
// docs/analysis/backend-inventory.md section 1.12 ("jurnal ditulis atas
// nama guru asli").
func (s *Service) UpsertJournal(ctx context.Context, tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) (domain.Journal, error) {
	if err := domain.ValidateJournalContent(in.Topic, in.Activities); err != nil {
		return domain.Journal{}, err
	}

	var out domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, found, err := s.repo.GetJournalByUnique(ctx, tenantID, in.AcademicYearID, teacherUserID, in.ClassID, in.SubjectID, in.LessonDate)
		if err != nil {
			return err
		}

		j := domain.Journal{
			TenantID: tenantID, AcademicYearID: in.AcademicYearID, TeacherUserID: teacherUserID,
			WrittenByUserID: writerUserID, ClassID: in.ClassID, SubjectID: in.SubjectID, LessonDate: in.LessonDate,
			Topic: in.Topic, Activities: in.Activities, Reflection: in.Reflection,
		}

		if found {
			j.ID = existing.ID
			out, err = s.repo.UpdateJournal(ctx, j)
			return err
		}
		out, err = s.repo.CreateJournal(ctx, j)
		return err
	})
	return out, err
}

func (s *Service) GetJournal(ctx context.Context, tenantID, id uuid.UUID) (domain.Journal, error) {
	var out domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.GetJournalByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrJournalNotFound
		}
		return nil
	})
	return out, err
}

// ListJournals returns a teacher's own journals, or (when viewAll is true,
// gated by view_journals_all in the transport layer) every journal for a
// class.
func (s *Service) ListJournals(ctx context.Context, tenantID, academicYearID uuid.UUID, teacherUserID, classID uuid.NullUUID) ([]domain.Journal, error) {
	var out []domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		if classID.Valid {
			out, err = s.repo.ListJournalsByClass(ctx, tenantID, academicYearID, classID.UUID)
			return err
		}
		out, err = s.repo.ListJournalsByTeacher(ctx, tenantID, academicYearID, teacherUserID.UUID)
		return err
	})
	return out, err
}

func (s *Service) DeleteJournal(ctx context.Context, tenantID, id, actorUserID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetJournalByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrJournalNotFound
		}
		if !domain.CanWrite(existing.TeacherUserID, actorUserID) && existing.WrittenByUserID != actorUserID {
			return domain.ErrJournalNotOwner
		}
		return s.repo.DeleteJournal(ctx, tenantID, id)
	})
}
