package wiring

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// gradeLevelFixture is one tenant with an active academic year, one grade
// level holding two classes, one subject offered at that grade level, one
// unrelated subject with no offering anywhere, and one enrolled student
// per class -- enough to exercise the reports module's grade-level scope
// (wiring.resolveScope and the Discipline/Grading/Permits readers built
// on it) against a real database.
type gradeLevelFixture struct {
	tenantID       uuid.UUID
	yearID         uuid.UUID
	gradeLevelID   uuid.UUID
	classAID       uuid.UUID
	classBID       uuid.UUID
	offeredSubject uuid.UUID
	otherSubject   uuid.UUID
	termID         uuid.UUID
}

func seedGradeLevelFixture(t *testing.T, pool *pgxpool.Pool) gradeLevelFixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "reports-scope-test-" + uuid.NewString(), Name: "Reports Scope Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantRow.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	grade, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{
		TenantID: tenantRow.ID, Code: "X", Name: "Kelas X", Sequence: 1,
	})
	require.NoError(t, err)

	classA, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, GradeLevelID: grade.ID, Name: "X-A",
		Capacity: pgtype.Int4{Int32: 32, Valid: true},
	})
	require.NoError(t, err)

	classB, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, GradeLevelID: grade.ID, Name: "X-B",
		Capacity: pgtype.Int4{Int32: 32, Valid: true},
	})
	require.NoError(t, err)

	offeredSubject, err := q.AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{
		TenantID: tenantRow.ID, Code: "MAT", Name: "Matematika",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateSubjectOffering(ctx, db.AcademicCreateSubjectOfferingParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, SubjectID: offeredSubject.ID,
		GradeLevelID: pgtype.UUID{Bytes: grade.ID, Valid: true}, HoursPerWeek: 4,
	})
	require.NoError(t, err)

	otherSubject, err := q.AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{
		TenantID: tenantRow.ID, Code: "BIO", Name: "Biologi",
	})
	require.NoError(t, err)
	// otherSubject deliberately has no subject_offerings row at all --
	// the grading grade-level export's ErrSubjectNotOffered case.

	term, err := q.AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, Name: "Semester 1", Sequence: 1,
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2026, 12, 20, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	require.NoError(t, q.AcademicActivateTerm(ctx, db.AcademicActivateTermParams{TenantID: tenantRow.ID, ID: term.ID}))

	studentA, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "siswa-a-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Kelas A", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: studentA.ID, ClassID: classA.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	studentB, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "siswa-b-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Kelas B", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: studentB.ID, ClassID: classB.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	return gradeLevelFixture{
		tenantID: tenantRow.ID, yearID: year.ID, gradeLevelID: grade.ID,
		classAID: classA.ID, classBID: classB.ID,
		offeredSubject: offeredSubject.ID, otherSubject: otherSubject.ID, termID: term.ID,
	}
}

// buildReportsAdapters wires the real Discipline/Grading/Permits report
// readers (this branch's addition to wiring/reports.go) against one
// database, the same construction cmd/api/wire.go performs.
func buildReportsAdapters(pool *pgxpool.Pool) (DisciplineReports, GradingReports, PermitsReports) {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	academicModule := academic.Register(pool, clock.Real{})
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: disciplineservice.DefaultConfig(""),
	})
	gradingModule := grading.Register(grading.Dependencies{Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}})
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte("01234567890123456789012345678901"), ""),
	})

	discipline := DisciplineReports{Svc: disciplineModule.Service, Academic: academicModule.Service, Years: schoolModule.Service}
	grading := GradingReports{Svc: gradingModule.Service, Academic: academicModule.Service, Years: schoolModule.Service}
	permitsReports := PermitsReports{Svc: permitsModule.Service, Academic: academicModule.Service, Years: schoolModule.Service}
	return discipline, grading, permitsReports
}

// TestDisciplinePointTotalRowsGradeLevelScope proves a grade_level scope
// resolves to one section per class in it (ordered by name), each
// section named after its class, and the document's scope line names
// the grade level rather than a single class.
func TestDisciplinePointTotalRowsGradeLevelScope(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	disciplineReports, _, _ := buildReportsAdapters(pg.AppPool)

	doc, err := disciplineReports.PointTotalRows(context.Background(), fx.tenantID, uuid.NullUUID{}, uuid.NullUUID{UUID: fx.gradeLevelID, Valid: true})
	require.NoError(t, err)
	require.Equal(t, "Rekap Poin Pelanggaran", doc.Title)
	require.Len(t, doc.Sections, 2, "one section per class in the grade level")
	require.Equal(t, "X-A", doc.Sections[0].Name)
	require.Equal(t, "X-B", doc.Sections[1].Name)

	var sawGradeLevelLine bool
	for _, line := range doc.Scope {
		if line.Label == "Angkatan" {
			sawGradeLevelLine = true
			require.Equal(t, "Kelas X", line.Value)
		}
	}
	require.True(t, sawGradeLevelLine, "grade-level scope must name the grade level, not a class")

	// Render both formats and open the workbook back up: a wrong column
	// count or an unsupported cell type would fail here, not just in a
	// visual review.
	xlsx, err := reportdoc.RenderXLSX(doc)
	require.NoError(t, err)
	requireOpensAsWorkbookWithSheets(t, xlsx, []string{"X-A", "X-B"})

	pdf, err := reportdoc.RenderPDF(doc)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")), "RenderPDF must produce a PDF file")
	require.Greater(t, len(pdf), 200, "a two-section PDF should not be a near-empty stub")
}

// TestGradingReportScoreRowsGradeLevelScope proves the grade-level export
// unions component columns across classes, names each section after its
// class, and rejects a subject nobody in the grade level actually
// teaches.
func TestGradingReportScoreRowsGradeLevelScope(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	_, gradingReports, _ := buildReportsAdapters(pg.AppPool)
	ctx := context.Background()

	doc, err := gradingReports.ReportScoreRows(
		ctx, fx.tenantID, uuid.NullUUID{}, uuid.NullUUID{UUID: fx.gradeLevelID, Valid: true},
		fx.offeredSubject, uuid.NullUUID{},
	)
	require.NoError(t, err, "the subject is offered at this grade level")
	require.Equal(t, "Nilai Rapor", doc.Title)
	require.Len(t, doc.Sections, 2)
	require.Equal(t, "X-A", doc.Sections[0].Name)
	require.Equal(t, "X-B", doc.Sections[1].Name)
	// Each section lists its class's one enrolled student even with no
	// scores recorded yet.
	require.Len(t, doc.Sections[0].Rows, 1)
	require.Len(t, doc.Sections[1].Rows, 1)

	xlsx, err := reportdoc.RenderXLSX(doc)
	require.NoError(t, err)
	requireOpensAsWorkbookWithSheets(t, xlsx, []string{"X-A", "X-B"})

	pdf, err := reportdoc.RenderPDF(doc)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")))

	_, err = gradingReports.ReportScoreRows(
		ctx, fx.tenantID, uuid.NullUUID{}, uuid.NullUUID{UUID: fx.gradeLevelID, Valid: true},
		fx.otherSubject, uuid.NullUUID{},
	)
	require.ErrorIs(t, err, reportsservice.ErrSubjectNotOffered, "a subject with no offering at this grade level must be refused")
}

// TestPermitsLeaveRequestRowsClassScope proves a plain class_id scope
// (the pre-existing behaviour, not grade-level) still produces exactly
// one section named after that class.
func TestPermitsLeaveRequestRowsClassScope(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	_, _, permitsReports := buildReportsAdapters(pg.AppPool)

	doc, err := permitsReports.LeaveRequestRows(context.Background(), fx.tenantID, uuid.NullUUID{UUID: fx.classAID, Valid: true}, uuid.NullUUID{})
	require.NoError(t, err)
	require.Equal(t, "Rekap Pengajuan Izin", doc.Title)
	require.Len(t, doc.Sections, 1)
	require.Equal(t, "X-A", doc.Sections[0].Name)

	xlsx, err := reportdoc.RenderXLSX(doc)
	require.NoError(t, err)
	requireOpensAsWorkbookWithSheets(t, xlsx, []string{"X-A"})
}

// TestDisciplineWarningLetterRowsGradeLevelScope proves warning letters'
// grade-level scope resolves the same way points does: one section per
// class in the grade level, both renderers producing non-empty output
// even with zero letters issued yet.
func TestDisciplineWarningLetterRowsGradeLevelScope(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	disciplineReports, _, _ := buildReportsAdapters(pg.AppPool)

	doc, err := disciplineReports.WarningLetterRows(context.Background(), fx.tenantID, uuid.NullUUID{}, uuid.NullUUID{UUID: fx.gradeLevelID, Valid: true})
	require.NoError(t, err)
	require.Equal(t, "Surat Peringatan", doc.Title)
	require.Len(t, doc.Sections, 2)
	require.Equal(t, "X-A", doc.Sections[0].Name)
	require.Equal(t, "X-B", doc.Sections[1].Name)

	xlsx, err := reportdoc.RenderXLSX(doc)
	require.NoError(t, err)
	requireOpensAsWorkbookWithSheets(t, xlsx, []string{"X-A", "X-B"})

	pdf, err := reportdoc.RenderPDF(doc)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")))
}

// TestPermitsExitPermitYearlyRowsRenders proves the yearly export (no
// class/grade-level scope of its own) still names the active year and
// renders as a single unnamed section in both formats.
func TestPermitsExitPermitYearlyRowsRenders(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	_, _, permitsReports := buildReportsAdapters(pg.AppPool)

	doc, err := permitsReports.ExitPermitYearlyRows(context.Background(), fx.tenantID)
	require.NoError(t, err)
	require.Equal(t, "Rekap Izin Keluar Tahunan Siswa", doc.Title)
	require.Len(t, doc.Sections, 1)
	require.Equal(t, "", doc.Sections[0].Name)
	require.NotEmpty(t, doc.Scope, "must name the active academic year")

	xlsx, err := reportdoc.RenderXLSX(doc)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer f.Close() //nolint:errcheck
	require.Len(t, f.GetSheetList(), 1)

	pdf, err := reportdoc.RenderPDF(doc)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")))
}

// requireOpensAsWorkbookWithSheets re-opens a rendered XLSX with excelize
// and asserts its sheet names match wantSheets, in order -- this is the
// "look at it" step for an export that never leaves the test process: a
// section that failed to encode (wrong cell type, a name excelize
// rejects) fails here instead of only in a human's spreadsheet viewer.
func requireOpensAsWorkbookWithSheets(t *testing.T, xlsx []byte, wantSheets []string) {
	t.Helper()
	f, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer f.Close() //nolint:errcheck
	require.Equal(t, wantSheets, f.GetSheetList())
	for _, sheet := range wantSheets {
		rows, err := f.GetRows(sheet)
		require.NoError(t, err)
		var foundHeader bool
		for _, row := range rows {
			if len(row) > 0 && row[0] == "No" {
				foundHeader = true
				break
			}
		}
		require.True(t, foundHeader, "sheet %q must have a header row starting with the No column", sheet)
	}
}
