package attendance

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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
	defaultOpts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}

	t.Run("exactly one of class_id/grade_level_id is required", func(t *testing.T) {
		_, err := svc.ExportDailyReport(ctx, w.tenantID, &w.classID, &w.gradeLevelID, w.today, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportDailyReport(ctx, w.tenantID, nil, nil, w.today, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)

		_, err = svc.ExportMonthlyRecap(ctx, w.tenantID, &w.classID, &w.gradeLevelID, month, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportMonthlyRecap(ctx, w.tenantID, nil, nil, month, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
	})

	t.Run("class scope daily export renders one sheet named after the class", func(t *testing.T) {
		xlsx, err := svc.ExportDailyReport(ctx, w.tenantID, &w.classID, nil, w.today, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Equal(t, []string{"X-A"}, f.GetSheetList())

		pdf, err := svc.ExportDailyReport(ctx, w.tenantID, &w.classID, nil, w.today, reportdoc.Options{Format: reportdoc.FormatPDF})
		require.NoError(t, err)
		require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")), "PDF format must render a PDF file")
	})

	t.Run("grade-level daily export covers every class, one sheet each named after its class", func(t *testing.T) {
		xlsx, err := svc.ExportDailyReport(ctx, w.tenantID, nil, &w.gradeLevelID, w.today, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.ElementsMatch(t, []string{"X-A", "X-B"}, f.GetSheetList(), "one sheet per class in the grade level")
	})

	t.Run("an unknown column choice is rejected", func(t *testing.T) {
		_, err := svc.ExportDailyReport(ctx, w.tenantID, &w.classID, nil, w.today, reportdoc.Options{
			Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "does_not_exist"}},
		})
		require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)
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

		xlsx, err := svc.ExportMonthlyRecap(ctx, w.tenantID, nil, &w.gradeLevelID, month, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.ElementsMatch(t, []string{"X-A", "X-B"}, f.GetSheetList())

		pdf, err := svc.ExportMonthlyRecap(ctx, w.tenantID, nil, &w.gradeLevelID, month, reportdoc.Options{Format: reportdoc.FormatPDF})
		require.NoError(t, err)
		require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")), "PDF format must render a PDF file")
	})

	t.Run("class scope monthly export renders a single sheet, and a caller-chosen column subset is honoured", func(t *testing.T) {
		xlsx, err := svc.ExportMonthlyRecap(ctx, w.tenantID, &w.classID, nil, month, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Len(t, f.GetSheetList(), 1)

		narrowed, err := svc.ExportMonthlyRecap(ctx, w.tenantID, &w.classID, nil, month, reportdoc.Options{
			Format: reportdoc.FormatXLSX,
			Columns: []reportdoc.ColumnChoice{
				{Key: "name", Label: "Nama"},
				{Key: "total"},
			},
		})
		require.NoError(t, err)
		nf, err := excelize.OpenReader(bytes.NewReader(narrowed))
		require.NoError(t, err)
		defer nf.Close() //nolint:errcheck
		sheet := nf.GetSheetList()[0]
		rows, err := nf.GetRows(sheet)
		require.NoError(t, err)
		require.Contains(
			t, rows, []string{"Nama", "Total"},
			"the column subset and relabel must be honoured, in the chosen order, as the table's header row",
		)
	})
}

// fakeLetterheadSource is a minimal reportdoc.LetterheadSource stub, for
// verifying a report export wires in whatever the school module's
// ReportLetterhead would have returned, without depending on that
// module's own tenant_settings fixture.
type fakeLetterheadSource struct {
	letterhead *reportdoc.Letterhead
	signature  *reportdoc.Signature
}

func (f fakeLetterheadSource) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return f.letterhead, f.signature, nil
}

// TestReportExportIndonesianTextAndLetterhead covers the Indonesian-
// default-locale text every migrated report export must use (never a raw
// status code, a long Indonesian date rather than ISO, a "Kelas"/
// "Angkatan" scope line) and that a wired LetterheadSource populates the
// document's letterhead and signature (with the report's own date, since
// ReportLetterhead itself never sets one).
func TestReportExportIndonesianTextAndLetterhead(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	svc.SetLetterheadSource(fakeLetterheadSource{
		letterhead: &reportdoc.Letterhead{Lines: []string{"SMA Negeri Uji Coba"}},
		signature: &reportdoc.Signature{
			Place: "Denpasar",
			Signers: []reportdoc.Signer{
				{RoleLabel: "Wali Kelas", Name: "Ni Made Sari"},
				{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta"},
			},
		},
	})
	w := seedWorld(t, ctx, pg.AdminPool, "id-text")

	actor := service.Actor{UserID: w.teacherID}
	session, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, session.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
		// student2 is left out of the save: the session still submits,
		// but produces no entry for them, so their status resolves to
		// the pseudo-code domain.StatusMixed -- it must still render as
		// the Indonesian "Campuran", never the raw code "MIXED".
	})
	require.NoError(t, err)

	xlsx, err := svc.ExportDailyReport(ctx, w.tenantID, &w.classID, nil, w.today, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer f.Close() //nolint:errcheck

	sheet := f.GetSheetList()[0]
	rows, err := f.GetRows(sheet)
	require.NoError(t, err)

	var flat []string
	for _, row := range rows {
		flat = append(flat, row...)
	}
	joined := strings.Join(flat, " | ")

	require.Contains(t, joined, "Hadir", "a real status code must render its Indonesian label, not the raw code")
	require.NotContains(t, joined, "\"H\"", "the raw status code must not appear")
	require.Contains(t, joined, "Campuran", "a day with a submitted session but no entry (StatusMixed) must render its Indonesian label")
	require.NotContains(t, joined, "MIXED", "the raw pseudo-status code must not appear")
	require.Contains(t, joined, "Kelas: X-A", "the class scope line must be present, in Indonesian")
	require.Contains(t, joined, domain.IndonesianDate(w.today), "the date scope line must be the Indonesian long date, not ISO")
	require.Contains(t, joined, "SMA Negeri Uji Coba", "the wired letterhead must render")
	require.Contains(t, joined, "Ni Made Sari", "the wired signature's first signer must render")
	require.Contains(t, joined, "I Wayan Arta", "the wired signature's second signer must render")
}
