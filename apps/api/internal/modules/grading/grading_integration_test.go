package grading

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// fixture is one tenant with an active academic year, one class, one
// subject and one active term -- everything SetManualScore needs, built
// straight through the generated db.Queries the way cmd/seed does, so the
// test does not depend on the academic module's own service layer.
type fixture struct {
	tenantID     uuid.UUID
	yearID       uuid.UUID
	gradeLevelID uuid.UUID
	classID      uuid.UUID
	subjectID    uuid.UUID
	termID       uuid.UUID
	teacherID    uuid.UUID
	studentID    uuid.UUID
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

	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: student.ID, ClassID: class.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	return fixture{
		tenantID: tenantRow.ID, yearID: year.ID, gradeLevelID: grade.ID, classID: class.ID, subjectID: subject.ID, termID: term.ID,
		teacherID: teacher.ID, studentID: student.ID,
	}
}

// seedSecondClass adds a second class to fx's own grade level and
// academic year, with one enrolled student -- for exercising the
// gradebook export's grade-level ("angkatan") scope, which must cover
// both classes.
func seedSecondClass(t *testing.T, pool *pgxpool.Pool, fx fixture) (classID, studentID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	class, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, GradeLevelID: fx.gradeLevelID, Name: "X-B",
	})
	require.NoError(t, err)

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "siswa2-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Dua", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, StudentUserID: student.ID, ClassID: class.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	return class.ID, student.ID
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
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})

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

// auditLogsFor loads every audit_logs row for one tenant/entity, newest
// first, to assert a service call wrote the record it claims to.
func auditLogsFor(t *testing.T, pool *pgxpool.Pool, tenantID, entityID uuid.UUID) []db.AuditLog {
	t.Helper()
	rows, err := db.New(pool).ListAuditLogs(context.Background(), db.ListAuditLogsParams{
		TenantID:  pgtype.UUID{Bytes: tenantID, Valid: true},
		EntityID:  pgtype.UUID{Bytes: entityID, Valid: true},
		PageLimit: 50,
	})
	require.NoError(t, err)
	return rows
}

// TestSaveScoresWritesAuditRecord covers grading's score save: SaveScores
// must write an audit_logs row, keyed on the component, inside the same
// transaction as the grade upserts.
func TestSaveScoresWritesAuditRecord(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})

	component, err := gradingModule.Service.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: uuid.NullUUID{UUID: fx.termID, Valid: true},
		Code: "UH1", Kind: domain.KindFormative, Weight: 1,
	})
	require.NoError(t, err)

	score := 85.0
	_, err = gradingModule.Service.SaveScores(ctx, fx.tenantID, component.ID, fx.teacherID, true, []service.ScoreEntry{
		{StudentUserID: fx.studentID, Score: &score},
	})
	require.NoError(t, err)

	logs := auditLogsFor(t, pg.AdminPool, fx.tenantID, component.ID)
	require.Len(t, logs, 1, "SaveScores must write exactly one audit_logs row")
	require.Equal(t, "grading.score_save", logs[0].Action)
	require.Equal(t, "assessment_component", logs[0].EntityType)
}

// TestPublishWritesAuditRecord covers grading's report publish: Publish
// must write an audit_logs row inside the same transaction that flips
// the class-subject publication flag.
func TestPublishWritesAuditRecord(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})

	_, err := gradingModule.Service.Publish(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, true)
	require.NoError(t, err)

	logs := auditLogsFor(t, pg.AdminPool, fx.tenantID, fx.classID)
	require.Len(t, logs, 1, "Publish must write exactly one audit_logs row")
	require.Equal(t, "grading.report_publish", logs[0].Action)
	require.Equal(t, "report_publication", logs[0].EntityType)
}
