package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// enrolledStudent adds one active student to the fixture's class A.
func enrolledStudent(t *testing.T, pool *pgxpool.Pool, fx gradeLevelFixture) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)
	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "siswa-" + uuid.NewString()[:8], PasswordHash: "x", Name: "Siswa", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, StudentUserID: student.ID, ClassID: fx.classAID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	return student.ID
}

// TestLateArrivalViolationIsNotRecordedWhileDisciplineIsOff covers permits'
// late-arrival review recording violations in discipline: with discipline
// turned off the adapter reports success without writing a record, so the
// review itself goes through; another tenant's identical call records one.
func TestLateArrivalViolationIsNotRecordedWhileDisciplineIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})
	adapter := LateArrivalDiscipline{Discipline: disciplineModule.Service, Clock: clock.Real{}, Flags: platformSvc}

	record := func(fx gradeLevelFixture) (instanceID uuid.UUID, err error) {
		student := enrolledStudent(t, pg.AdminPool, fx)
		var violationType uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`insert into violation_types (tenant_id, code, name, points) values ($1, 'TLT', 'Terlambat', 5) returning id`,
			fx.tenantID).Scan(&violationType))
		instanceID = uuid.New()
		return instanceID, adapter.RecordLateArrivalViolation(ctx, fx.tenantID, student, violationType, instanceID, student, "Proses masuk terlambat ke-1")
	}
	records := func(instanceID uuid.UUID) int {
		var n int
		require.NoError(t, pg.AdminPool.QueryRow(ctx, `select count(*) from violation_records where workflow_instance_id = $1`, instanceID).Scan(&n))
		return n
	}

	on := seedGradeLevelFixture(t, pg.AdminPool)
	off := seedGradeLevelFixture(t, pg.AdminPool)
	_, err := platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModuleDiscipline), false)
	require.NoError(t, err)

	onInstance, err := record(on)
	require.NoError(t, err)
	require.Equal(t, 1, records(onInstance))

	offInstance, err := record(off)
	require.NoError(t, err, "discipline off: the late-arrival review must not fail")
	require.Zero(t, records(offInstance), "discipline off: no violation is recorded")
}

// TestMentoringSnapshotKeepsWorkingWhileGradingIsOff covers mentoring
// reading grading: grading refuses every read while it is turned off, and
// the mentor's student snapshot must still come back (without grades)
// instead of failing.
func TestMentoringSnapshotKeepsWorkingWhileGradingIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := grading.Register(grading.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}, Flags: GradingFlags{Platform: platformSvc},
	})
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})
	mentoringModule := mentoring.Register(mentoring.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service,
		Discipline: MentoringDiscipline{Svc: disciplineModule.Service}, Grading: MentoringGrading{Svc: gradingModule.Service},
		Flags: PlatformFlags{Svc: platformSvc}, Clock: clock.Real{},
	})

	on := seedGradeLevelFixture(t, pg.AdminPool)
	off := seedGradeLevelFixture(t, pg.AdminPool)
	onStudent := enrolledStudent(t, pg.AdminPool, on)
	offStudent := enrolledStudent(t, pg.AdminPool, off)
	_, err := platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModuleGrading), false)
	require.NoError(t, err)

	_, err = mentoringModule.Service.StudentSnapshot(ctx, on.tenantID, onStudent)
	require.NoError(t, err)

	snapshot, err := mentoringModule.Service.StudentSnapshot(ctx, off.tenantID, offStudent)
	require.NoError(t, err, "grading off: the snapshot still loads")
	require.Equal(t, offStudent, snapshot.StudentUserID)
	require.Equal(t, "X-A", snapshot.ClassName)
	require.Empty(t, snapshot.PublishedSubjects)
}
