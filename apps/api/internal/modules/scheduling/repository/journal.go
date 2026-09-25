package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
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

// journalFilterParams builds the shared narg set both ListJournalsFiltered
// and CountJournalsFiltered take, so the two queries can never drift apart.
// It only maps f's optional fields -- tenant/academic-year scoping is
// applied directly by the two callers, which already have those values.
func journalFilterParams(f service.JournalFilter) (teacherID, classID pgtype.UUID, from, to pgtype.Date, search pgtype.Text) {
	teacherID = pdatabase.NullUUID(f.TeacherUserID)
	classID = pdatabase.NullUUID(f.ClassID)
	if f.DateFrom != nil {
		from = pdatabase.Date(*f.DateFrom)
	}
	if f.DateTo != nil {
		to = pdatabase.Date(*f.DateTo)
	}
	search = pdatabase.Text(f.Search)
	return
}

func (r *Repository) ListJournalsFiltered(ctx context.Context, tenantID, academicYearID uuid.UUID, f service.JournalFilter) ([]domain.Journal, error) {
	teacherID, classID, from, to, search := journalFilterParams(f)
	rows, err := r.queries(ctx).ListJournalsFiltered(ctx, db.ListJournalsFilteredParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID, ClassID: classID,
		DateFrom: from, DateTo: to, Search: search,
		Limit: int32(f.Limit), Offset: int32(f.Offset), //nolint:gosec // clamped by the service
	})
	if err != nil {
		return nil, err
	}
	return toJournals(rows), nil
}

func (r *Repository) CountJournalsFiltered(ctx context.Context, tenantID, academicYearID uuid.UUID, f service.JournalFilter) (int64, error) {
	teacherID, classID, from, to, search := journalFilterParams(f)
	return r.queries(ctx).CountJournalsFiltered(ctx, db.CountJournalsFilteredParams{
		TenantID: tenantID, AcademicYearID: academicYearID, TeacherUserID: teacherID, ClassID: classID,
		DateFrom: from, DateTo: to, Search: search,
	})
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
