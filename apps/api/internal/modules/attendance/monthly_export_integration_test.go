package attendance

import (
	"bytes"
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// secondClass is a second class in w's own grade level and academic year,
// with one enrolled student and its own today-schedule (same subject,
// teacher and period as w's fixture), for exercising the grade-level
// ("angkatan") report export scope: a real export must cover both classes.
type secondClass struct {
	classID, studentID, scheduleTodayID uuid.UUID
}

func seedSecondClass(t *testing.T, ctx context.Context, pool *pgxpool.Pool, w world, slug string) secondClass {
	t.Helper()
	q := db.New(pool)

	class, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, GradeLevelID: w.gradeLevelID, Name: "X-B",
	})
	require.NoError(t, err)

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student3-" + slug, PasswordHash: "x", Name: "Student Three", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	_, err = pool.Exec(ctx,
		`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
		w.tenantID, w.yearID, student.ID, class.ID,
	)
	require.NoError(t, err)

	// A different teacher than w's: the exclusion constraint on schedules
	// forbids the same teacher teaching two classes in the same period on
	// the same day of week, which w.teacherID already does for w.classID.
	schedule, err := q.CreateSchedule(ctx, db.CreateScheduleParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, ClassID: class.ID, SubjectID: w.subjectID, TeacherUserID: w.otherTeacherID,
		DayOfWeek: domain.IsoWeekday(w.today), StartPeriodID: w.periodID, EndPeriodID: w.periodID, StartSeq: 1, EndSeq: 1, Source: "admin",
	})
	require.NoError(t, err)

	return secondClass{classID: class.ID, studentID: student.ID, scheduleTodayID: schedule.ID}
}

// TestReportExportGradeLevelScope covers the new grade-level ("angkatan")
// scope on both the daily XLSX export and the new monthly recap export:
// exactly one of class_id/grade_level_id must be given, and the
// grade-level scope must resolve every class of the grade level (ordered
// by name) into its own section/sheet, each with its own roster's data --
// not just the requesting class.
func TestReportExportGradeLevelScope(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "grade-scope")
	class2 := seedSecondClass(t, ctx, pg.AdminPool, w, "grade-scope")

	actor := service.Actor{UserID: w.teacherID}

	session1, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, session1.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{
			{StudentUserID: w.student1ID, StatusCode: "H"},
			{StudentUserID: w.student2ID, StatusCode: "S"},
		},
	})
	require.NoError(t, err)

	actor2 := service.Actor{UserID: w.otherTeacherID}
	session2, err := svc.OpenSession(ctx, w.tenantID, actor2, class2.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor2, session2.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: class2.studentID, StatusCode: "A"}},
	})
	require.NoError(t, err)

	month := w.today.Format("2006-01")

	t.Run("exactly one of class_id/grade_level_id is required", func(t *testing.T) {
		_, err := svc.ExportDailyReportXLSXScoped(ctx, w.tenantID, &w.classID, &w.gradeLevelID, w.today)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportDailyReportXLSXScoped(ctx, w.tenantID, nil, nil, w.today)
		require.ErrorIs(t, err, domain.ErrInvalidScope)

		_, err = svc.ExportMonthlyReportXLSX(ctx, w.tenantID, &w.classID, &w.gradeLevelID, month)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportMonthlyReportXLSX(ctx, w.tenantID, nil, nil, month)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
	})

	t.Run("class scope keeps ExportDailyReportXLSX's single-sheet behaviour", func(t *testing.T) {
		scoped, err := svc.ExportDailyReportXLSXScoped(ctx, w.tenantID, &w.classID, nil, w.today)
		require.NoError(t, err)
		direct, err := svc.ExportDailyReportXLSX(ctx, w.tenantID, w.classID, w.today)
		require.NoError(t, err)
		require.Equal(t, direct, scoped, "an unmigrated caller passing only class_id must see byte-identical output")
	})

	t.Run("grade-level daily export covers every class, one sheet each", func(t *testing.T) {
		xlsx, err := svc.ExportDailyReportXLSXScoped(ctx, w.tenantID, nil, &w.gradeLevelID, w.today)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Len(t, f.GetSheetList(), 2, "one sheet per class in the grade level")
	})

	t.Run("grade-level monthly recap has one section per class with correct per-status counts", func(t *testing.T) {
		recaps, err := svc.GetMonthlyRecap(ctx, w.tenantID, nil, &w.gradeLevelID, month)
		require.NoError(t, err)
		require.Len(t, recaps, 2, "one recap section per class")

		byClass := make(map[uuid.UUID]service.ClassMonthlyRecap, len(recaps))
		for _, r := range recaps {
			byClass[r.ClassID] = r
		}

		classARecap, ok := byClass[w.classID]
		require.True(t, ok)
		require.Len(t, classARecap.Rows, 2)
		rowsByStudent := make(map[uuid.UUID]service.MonthlyRecapRow, len(classARecap.Rows))
		for _, r := range classARecap.Rows {
			rowsByStudent[r.StudentUserID] = r
		}
		require.Equal(t, 1, rowsByStudent[w.student1ID].Counts["H"])
		require.Equal(t, 1, rowsByStudent[w.student1ID].TotalDays)
		require.InDelta(t, 100.0, rowsByStudent[w.student1ID].PercentPresent, 0.01)
		require.Equal(t, 1, rowsByStudent[w.student2ID].Counts["S"])
		require.InDelta(t, 0.0, rowsByStudent[w.student2ID].PercentPresent, 0.01)

		classBRecap, ok := byClass[class2.classID]
		require.True(t, ok)
		require.Len(t, classBRecap.Rows, 1)
		require.Equal(t, 1, classBRecap.Rows[0].Counts["A"])
		require.InDelta(t, 0.0, classBRecap.Rows[0].PercentPresent, 0.01)

		xlsx, err := svc.ExportMonthlyReportXLSX(ctx, w.tenantID, nil, &w.gradeLevelID, month)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Len(t, f.GetSheetList(), 2)
	})

	t.Run("class scope monthly export renders a single sheet", func(t *testing.T) {
		xlsx, err := svc.ExportMonthlyReportXLSX(ctx, w.tenantID, &w.classID, nil, month)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Len(t, f.GetSheetList(), 1)
	})
}
