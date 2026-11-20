package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// JournalInput is what a caller supplies to create or update a class
// journal. ID names the journal being edited; without it SaveJournal only
// creates, so a second "new journal" for a lesson that already has one
// never replaces the first.
type JournalInput struct {
	ID             uuid.NullUUID
	AcademicYearID uuid.UUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	LessonDate     time.Time
	Topic          string
	Activities     string
	Reflection     string
}

// UpsertJournal creates or updates the journal for
// (teacherUserID, class, subject, lessonDate) in one atomic statement. It
// is the attendance editor's write, where the journal tab always edits
// that lesson's one journal; the journal screen goes through SaveJournal,
// which never replaces a journal it was not asked to edit. writerUserID
// is the actual author -- the teacher themselves, or their accepted
// substitute for that date -- while teacherUserID stays the schedule's own
// teacher, per docs/analysis/backend-inventory.md section 1.12 ("jurnal
// ditulis atas nama guru asli").
func (s *Service) UpsertJournal(ctx context.Context, tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) (domain.Journal, error) {
	if err := domain.ValidateJournalContent(in.Topic, in.Activities); err != nil {
		return domain.Journal{}, err
	}

	var out domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertTeaches(ctx, tenantID, teacherUserID, in); err != nil {
			return err
		}
		var err error
		out, err = s.repo.UpsertJournal(ctx, journalFromInput(tenantID, teacherUserID, writerUserID, in))
		return err
	})
	return out, err
}

// SaveJournal is the journal screen's write. Without in.ID it creates the
// journal for (teacherUserID, class, subject, lessonDate) and refuses with
// ErrJournalDuplicate when that lesson already has one, unless the stored
// journal says exactly what this one does (a repeated submit), which is
// returned as is. With in.ID it edits that journal, its lesson included,
// provided it is the teacher's own.
func (s *Service) SaveJournal(ctx context.Context, tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) (domain.Journal, error) {
	if err := domain.ValidateJournalContent(in.Topic, in.Activities); err != nil {
		return domain.Journal{}, err
	}

	var out domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertTeaches(ctx, tenantID, teacherUserID, in); err != nil {
			return err
		}
		j := journalFromInput(tenantID, teacherUserID, writerUserID, in)

		if in.ID.Valid {
			existing, err := s.repo.GetJournalByID(ctx, tenantID, in.ID.UUID)
			if err != nil {
				return domain.ErrJournalNotFound
			}
			if existing.TeacherUserID != teacherUserID || existing.AcademicYearID != in.AcademicYearID {
				return domain.ErrJournalNotOwner
			}
			j.ID = existing.ID
			j.AttendanceSessionID = existing.AttendanceSessionID
			out, err = s.repo.UpdateJournal(ctx, j)
			return err
		}

		existing, found, err := s.repo.GetJournalByUnique(ctx, tenantID, in.AcademicYearID, teacherUserID, in.ClassID, in.SubjectID, in.LessonDate)
		if err != nil {
			return err
		}
		if found {
			if existing.SameContent(j) {
				out = existing
				return nil
			}
			return domain.ErrJournalDuplicate
		}
		out, err = s.repo.CreateJournal(ctx, j)
		return err
	})
	if errors.Is(err, domain.ErrJournalDuplicate) && !in.ID.Valid {
		// A concurrent identical submit can lose the insert race; it is
		// the same journal, so answer with it rather than a conflict.
		if same, ok := s.identicalJournal(ctx, tenantID, teacherUserID, writerUserID, in); ok {
			return same, nil
		}
	}
	return out, err
}

// identicalJournal looks up the stored journal for in's lesson and reports
// whether it already says exactly what in does.
func (s *Service) identicalJournal(ctx context.Context, tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) (domain.Journal, bool) {
	var existing domain.Journal
	var found bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		existing, found, err = s.repo.GetJournalByUnique(ctx, tenantID, in.AcademicYearID, teacherUserID, in.ClassID, in.SubjectID, in.LessonDate)
		return err
	})
	if err != nil || !found || !existing.SameContent(journalFromInput(tenantID, teacherUserID, writerUserID, in)) {
		return domain.Journal{}, false
	}
	return existing, true
}

// assertTeaches enforces that a journal may only be logged for a
// class/subject the teacher is actually assigned to teach this year
// (docs/analysis/backend-inventory.md section 1.12, "kelas+mapel wajib
// penugasan mengajar aktif"): without this, any authenticated teacher
// could log a lesson for any class.
func (s *Service) assertTeaches(ctx context.Context, tenantID, teacherUserID uuid.UUID, in JournalInput) error {
	assigned, err := s.repo.HasTeachingAssignment(ctx, tenantID, in.AcademicYearID, teacherUserID, in.SubjectID, in.ClassID)
	if err != nil {
		return err
	}
	if !assigned {
		return domain.ErrTeacherNotAssigned
	}
	return nil
}

func journalFromInput(tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) domain.Journal {
	return domain.Journal{
		TenantID: tenantID, AcademicYearID: in.AcademicYearID, TeacherUserID: teacherUserID,
		WrittenByUserID: writerUserID, ClassID: in.ClassID, SubjectID: in.SubjectID, LessonDate: in.LessonDate,
		Topic: in.Topic, Activities: in.Activities, Reflection: in.Reflection,
	}
}

// GetJournal returns one journal, gated to its owner (the teaching
// teacher), its writer (an accepted substitute who filled it in), or a
// caller with canViewAll (view_journals_all) -- any other authenticated
// user could otherwise read any teacher's lesson journal by ID, which this
// rebuild had stopped checking entirely.
func (s *Service) GetJournal(ctx context.Context, tenantID, id, actorUserID uuid.UUID, canViewAll bool) (domain.Journal, error) {
	var out domain.Journal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.GetJournalByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrJournalNotFound
		}
		if !canViewAll && out.TeacherUserID != actorUserID && out.WrittenByUserID != actorUserID {
			return domain.ErrJournalNotOwner
		}
		return nil
	})
	return out, err
}

// JournalFilter narrows ListJournals. Exactly one of TeacherUserID or
// ClassID is set by the transport layer (self-service vs. the
// view_journals_all supervisory view); DateFrom/DateTo/Search add the date
// range and text search the old system's journal list had
// (class_journals.go L85-107) and this rebuild had dropped.
type JournalFilter struct {
	TeacherUserID uuid.NullUUID
	ClassID       uuid.NullUUID
	DateFrom      *time.Time
	DateTo        *time.Time
	Search        string
	Limit, Offset int
}

// ListJournals returns a teacher's own journals, or (when ClassID is set,
// gated by view_journals_all in the transport layer) every journal for a
// class, plus the total count matching f for pagination.
func (s *Service) ListJournals(ctx context.Context, tenantID, academicYearID uuid.UUID, f JournalFilter) ([]domain.Journal, int64, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	var out []domain.Journal
	var total int64
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListJournalsFiltered(ctx, tenantID, academicYearID, f)
		if err != nil {
			return err
		}
		total, err = s.repo.CountJournalsFiltered(ctx, tenantID, academicYearID, f)
		return err
	})
	return out, total, err
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
