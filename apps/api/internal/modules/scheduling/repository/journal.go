package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateJournal(ctx context.Context, j domain.Journal) (domain.Journal, error) {
	row, err := r.queries(ctx).CreateJournal(ctx, db.CreateJournalParams{
		TenantID: j.TenantID, AcademicYearID: j.AcademicYearID, TeacherUserID: j.TeacherUserID,
		WrittenByUserID: j.WrittenByUserID, ClassID: j.ClassID, SubjectID: j.SubjectID,
		LessonDate: pdatabase.Date(j.LessonDate), Topic: j.Topic, Activities: j.Activities,
		Reflection: pdatabase.Text(j.Reflection), AttendanceSessionID: pdatabase.NullUUID(j.AttendanceSessionID),
	})
	if err != nil {
		return domain.Journal{}, err
	}
	return toJournal(row), nil
}

func (r *Repository) UpdateJournal(ctx context.Context, j domain.Journal) (domain.Journal, error) {
	row, err := r.queries(ctx).UpdateJournal(ctx, db.UpdateJournalParams{
		TenantID: j.TenantID, ID: j.ID, Topic: j.Topic, Activities: j.Activities,
		Reflection: pdatabase.Text(j.Reflection), WrittenByUserID: j.WrittenByUserID,
		AttendanceSessionID: pdatabase.NullUUID(j.AttendanceSessionID),
	})
	if err != nil {
		return domain.Journal{}, err
	}
	return toJournal(row), nil
}

func (r *Repository) GetJournalByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Journal, error) {
	row, err := r.queries(ctx).GetJournalByID(ctx, db.GetJournalByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Journal{}, err
	}
	return toJournal(row), nil
}

func (r *Repository) GetJournalByUnique(ctx context.Context, tenantID, academicYearID, teacherID, classID, subjectID uuid.UUID, lessonDate time.Time) (domain.Journal, bool, error) {
	row, err := r.queries(ctx).GetJournalByUnique(ctx, db.GetJournalByUniqueParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID,
		ClassID: classID, SubjectID: subjectID, LessonDate: pdatabase.Date(lessonDate),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Journal{}, false, nil
	}
	if err != nil {
		return domain.Journal{}, false, err
	}
	return toJournal(row), true, nil
}

func (r *Repository) ListJournalsByTeacher(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID) ([]domain.Journal, error) {
	rows, err := r.queries(ctx).ListJournalsByTeacher(ctx, db.ListJournalsByTeacherParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID,
	})
	if err != nil {
		return nil, err
	}
	return toJournals(rows), nil
}

func (r *Repository) ListJournalsByClass(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]domain.Journal, error) {
	rows, err := r.queries(ctx).ListJournalsByClass(ctx, db.ListJournalsByClassParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: classID,
	})
	if err != nil {
		return nil, err
	}
	return toJournals(rows), nil
}

func (r *Repository) DeleteJournal(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).DeleteJournal(ctx, db.DeleteJournalParams{TenantID: tenantID, ID: id})
}

func toJournals(rows []db.ClassJournal) []domain.Journal {
	out := make([]domain.Journal, len(rows))
	for i, row := range rows {
		out[i] = toJournal(row)
	}
	return out
}
