package academic

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// rosterFixture is one tenant with an active academic year, one grade
// level, two classes, and one enrolled student per class -- everything
// ExportClassRoster's class and grade-level scopes need.
type rosterFixture struct {
	tenantID               uuid.UUID
	yearID                 uuid.UUID
	gradeLevelID           uuid.UUID
	classAID, classBID     uuid.UUID
	studentAID, studentBID uuid.UUID
}

func seedRosterFixture(t *testing.T, pool *pgxpool.Pool) rosterFixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "roster-test-" + uuid.NewString(), Name: "Roster Test", EducationLevel: "sma",
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
	})
	require.NoError(t, err)
	classB, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, GradeLevelID: grade.ID, Name: "X-B",
	})
	require.NoError(t, err)

	studentA := seedRosterStudent(t, ctx, pool, tenantRow.ID, "Siswa Satu", "male", "Denpasar", "2010-01-15", "1001", "Bapak Satu")
	studentB := seedRosterStudent(t, ctx, pool, tenantRow.ID, "Siswa Dua", "female", "Badung", "2010-03-20", "1002", "Ibu Dua")

	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: studentA, ClassID: classA.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: studentB, ClassID: classB.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	return rosterFixture{
		tenantID: tenantRow.ID, yearID: year.ID, gradeLevelID: grade.ID,
		classAID: classA.ID, classBID: classB.ID, studentAID: studentA, studentBID: studentB,
	}
}

// seedRosterStudent creates a student user with a full user_profiles/
// student_profiles record (gender, birth place/date, NIS, guardian name)
// -- everything the roster export's columns need, inserted via raw SQL
// since no generated Create query covers this full a row (the same
// approach attendance/scheduling's own fixtures use for tables with no
// write query yet).
func seedRosterStudent(
	t *testing.T, ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID,
	name, gender, birthPlace, birthDate, nis, guardianName string,
) uuid.UUID {
	t.Helper()
	q := db.New(pool)
	user, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "siswa-" + uuid.NewString(), PasswordHash: "x", Name: name, Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	_, err = pool.Exec(ctx,
		`insert into user_profiles (user_id, tenant_id, kind, gender, birth_place, birth_date) values ($1, $2, 'student', $3, $4, $5)`,
		user.ID, tenantID, gender, birthPlace, birthDate,
	)
	require.NoError(t, err)

	_, err = pool.Exec(ctx,
		`insert into student_profiles (user_id, tenant_id, nis, guardian_name) values ($1, $2, $3, $4)`,
		user.ID, tenantID, nis, guardianName,
	)
	require.NoError(t, err)

	return user.ID
}

// TestExportClassRosterGradeLevelScope covers the new class roster
// export: the class and grade-level ("angkatan") scopes, with the full
// set of fields a printed "daftar siswa" needs.
func TestExportClassRosterGradeLevelScope(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedRosterFixture(t, pg.AdminPool)
	ctx := context.Background()

	academicModule := Register(pg.AppPool, clock.Real{})
	svc := academicModule.Service

	classA, gradeLevel := fx.classAID, fx.gradeLevelID
	defaultOpts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}

	t.Run("exactly one of class_id/grade_level_id is required", func(t *testing.T) {
		_, err := svc.ExportClassRoster(ctx, fx.tenantID, service.RosterExportQuery{ClassID: &classA, GradeLevelID: &gradeLevel}, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportClassRoster(ctx, fx.tenantID, service.RosterExportQuery{}, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
	})

	t.Run("class scope renders one section with NIS, gender and guardian", func(t *testing.T) {
		xlsx, err := svc.ExportClassRoster(ctx, fx.tenantID, service.RosterExportQuery{ClassID: &classA}, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Equal(t, []string{"X-A"}, f.GetSheetList())
		rows, err := f.GetRows("X-A")
		require.NoError(t, err)
		var flat []string
		for _, row := range rows {
			flat = append(flat, row...)
		}
		require.Contains(t, flat, "Siswa Satu")
		require.Contains(t, flat, "1001")
		require.Contains(t, flat, "Laki-laki", "gender must render its Indonesian label, not the raw code")
		require.NotContains(t, flat, "male")
		require.Contains(t, flat, "Bapak Satu")
		require.Contains(t, flat, "Denpasar")

		pdf, err := svc.ExportClassRoster(ctx, fx.tenantID, service.RosterExportQuery{ClassID: &classA}, reportdoc.Options{Format: reportdoc.FormatPDF})
		require.NoError(t, err)
		require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")))
	})

	t.Run("grade-level scope covers both classes, one section each", func(t *testing.T) {
		xlsx, err := svc.ExportClassRoster(ctx, fx.tenantID, service.RosterExportQuery{GradeLevelID: &gradeLevel}, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.ElementsMatch(t, []string{"X-A", "X-B"}, f.GetSheetList())

		bRows, err := f.GetRows("X-B")
		require.NoError(t, err)
		var bFlat []string
		for _, row := range bRows {
			bFlat = append(bFlat, row...)
		}
		require.Contains(t, bFlat, "Siswa Dua")
		require.Contains(t, bFlat, "Perempuan")
	})

	t.Run("a caller-chosen column subset is honoured", func(t *testing.T) {
		narrowed, err := svc.ExportClassRoster(ctx, fx.tenantID, service.RosterExportQuery{ClassID: &classA}, reportdoc.Options{
			Format: reportdoc.FormatXLSX,
			Columns: []reportdoc.ColumnChoice{
				{Key: "name", Label: "Nama"},
				{Key: "nis"},
			},
		})
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(narrowed))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		rows, err := f.GetRows(f.GetSheetList()[0])
		require.NoError(t, err)
		require.Contains(t, rows, []string{"Nama", "NIS"})
	})
}
