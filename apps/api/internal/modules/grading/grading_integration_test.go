package grading

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// startTestPostgres mirrors the attendance module's helper of the same
// name: a real Postgres in Docker, every migration applied. Skips instead
// of failing when Docker is unreachable, and skips under -short.
func startTestPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping integration test in -short mode")
	}

	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("newsekolah"),
		postgres.WithUsername("newsekolah"),
		postgres.WithPassword("newsekolah"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Skipf("docker not available, skipping integration test: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(context.Background()) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	pool, err := database.NewPool(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, migrator.UpAll(ctx, dsn, pool))
	return pool
}

// fixture is one tenant with an active academic year, one class, one
// subject and one active term -- everything SetManualScore needs, built
// straight through the generated db.Queries the way cmd/seed does, so the
// test does not depend on the academic module's own service layer.
type fixture struct {
	tenantID  uuid.UUID
	classID   uuid.UUID
	subjectID uuid.UUID
	termID    uuid.UUID
	teacherID uuid.UUID
	studentID uuid.UUID
}

func seedFixture(t *testing.T, pool *pgxpool.Pool) fixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "grading-test-" + uuid.NewString(), Name: "Grading Test", EducationLevel: "sma",
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

	class, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, GradeLevelID: grade.ID, Name: "X-A",
		Capacity: pgtype.Int4{Int32: 32, Valid: true},
	})
	require.NoError(t, err)

	subject, err := q.AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{
		TenantID: tenantRow.ID, Code: "MAT", Name: "Matematika",
	})
	require.NoError(t, err)

	term, err := q.AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, Name: "Semester 1", Sequence: 1,
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2026, 12, 20, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	require.NoError(t, q.AcademicActivateTerm(ctx, db.AcademicActivateTermParams{TenantID: tenantRow.ID, ID: term.ID}))

	teacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "guru-" + uuid.NewString(), PasswordHash: "x",
		Name: "Guru Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "siswa-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Baru", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	return fixture{
		tenantID: tenantRow.ID, classID: class.ID, subjectID: subject.ID, termID: term.ID,
		teacherID: teacher.ID, studentID: student.ID,
	}
}

// TestSetManualScoreOnStudentWithNoGrades reproduces the transfer-student
// defect: report_scores rows are normally created only by
// recomputeReportScores for students who already have a component grade,
// so a manual override for a student with none used to fail with
// pgx.ErrNoRows surfaced as ASSESSMENT_COMPONENT_NOT_FOUND. SetManualScore
// must now insert the row (with the automatic baseline it would otherwise
// have) instead of failing, and clearing the override afterwards must
// restore that same baseline.
func TestSetManualScoreOnStudentWithNoGrades(t *testing.T) {
	pool := startTestPostgres(t)
	fx := seedFixture(t, pool)
	ctx := context.Background()

	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}})

	manual := 88.0
	result, err := gradingModule.Service.SetManualScore(
		ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID, fx.studentID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, &manual,
	)
	require.NoError(t, err, "a student with no component grades must still accept a manual override")
	require.InDelta(t, 88, result.FinalScore, 0.001)
	require.NotNil(t, result.ManualScore)
	require.InDelta(t, 88, *result.ManualScore, 0.001)
	require.NotNil(t, result.AutomaticScore)
	require.InDelta(t, 0, *result.AutomaticScore, 0.001, "no grades and no promotion range means the automatic baseline is the scale minimum")

	result, err = gradingModule.Service.SetManualScore(
		ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID, fx.studentID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, nil,
	)
	require.NoError(t, err, "clearing the override on the now-existing row must succeed")
	require.Nil(t, result.ManualScore)
	require.InDelta(t, 0, result.FinalScore, 0.001, "clearing the override restores the automatic baseline")
}
