package wiring

import (
	"context"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// memoryScheduleStorage stands in for S3: it keeps uploads in memory and
// signs nothing.
type memoryScheduleStorage struct{ keys []string }

func (m *memoryScheduleStorage) PutObject(_ context.Context, objectKey string, _ []byte, _ string) error {
	m.keys = append(m.keys, objectKey)
	return nil
}

func (m *memoryScheduleStorage) PresignedGetURL(_ context.Context, objectKey string, _ time.Duration) (*url.URL, error) {
	return url.Parse("https://storage.test/" + objectKey)
}

// seedDailySchedule inserts an enabled daily schedule of kind at hour,
// owned by a fresh user of the tenant.
func seedDailySchedule(t *testing.T, pool *pgxpool.Pool, tenantID uuid.UUID, kind reportsservice.Kind, hour int) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	owner, err := db.New(pool).CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "owner-" + uuid.NewString()[:8], PasswordHash: "x", Name: "Owner", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		insert into report_schedules (tenant_id, report_kind, params, cadence, hour, recipients, created_by)
		values ($1, $2, '{}'::jsonb, 'daily', $3, array['kepala@sekolah.test'], $4) returning id`,
		tenantID, string(kind), hour, owner.ID).Scan(&id))
	return id
}

func runCount(t *testing.T, pool *pgxpool.Pool, scheduleID uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `select count(*) from report_schedule_runs where schedule_id = $1`, scheduleID).Scan(&n))
	return n
}

// TestReportSchedulesSkipDisabledModules runs the hourly scheduled-export
// job once over three tenants: one with every module on, one with reports
// turned off, and one with discipline turned off. Nothing of the
// reports-off tenant runs; the discipline-off tenant's discipline report is
// skipped while its permits report still runs; the all-on tenant runs both.
// A skipped schedule is never claimed, so it leaves no run row and sends
// nothing.
func TestReportSchedulesSkipDisabledModules(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	// 02:10 UTC is 09:10 in the fixture tenants' Asia/Jakarta.
	now := time.Date(2030, 1, 2, 2, 10, 0, 0, time.UTC)
	const dueHour = 9

	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	disciplineReports, _, permitsReports := buildReportsAdapters(pg.AppPool)
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	academicModule := academic.Register(pg.AppPool, clock.Real{})
	storage := &memoryScheduleStorage{}
	reportsModule := reports.Register(reports.Dependencies{
		Pool: pg.AppPool, Discipline: disciplineReports, Permits: permitsReports, Storage: storage, Clock: clock.Frozen{At: now},
		Academic: AcademicReports{Academic: academicModule.Service, School: schoolModule.Service},
		Flags:    platformSvc,
	})

	allOn := seedGradeLevelFixture(t, pg.AdminPool)
	reportsOff := seedGradeLevelFixture(t, pg.AdminPool)
	disciplineOff := seedGradeLevelFixture(t, pg.AdminPool)
	type pair struct{ discipline, permits uuid.UUID }
	schedules := map[uuid.UUID]pair{}
	for _, fx := range []gradeLevelFixture{allOn, reportsOff, disciplineOff} {
		schedules[fx.tenantID] = pair{
			discipline: seedDailySchedule(t, pg.AdminPool, fx.tenantID, reportsservice.KindDisciplinePoints, dueHour),
			permits:    seedDailySchedule(t, pg.AdminPool, fx.tenantID, reportsservice.KindExitPermitsYearly, dueHour),
		}
	}
	_, err := platformSvc.SetFlag(ctx, reportsOff.tenantID, string(platformdomain.ModuleReports), false)
	require.NoError(t, err)
	_, err = platformSvc.SetFlag(ctx, disciplineOff.tenantID, string(platformdomain.ModuleDiscipline), false)
	require.NoError(t, err)

	pending, err := reportsModule.ScheduleService.RunDueSchedules(ctx)
	require.NoError(t, err)

	require.Equal(t, 1, runCount(t, pg.AdminPool, schedules[allOn.tenantID].discipline))
	require.Equal(t, 1, runCount(t, pg.AdminPool, schedules[allOn.tenantID].permits))
	require.Zero(t, runCount(t, pg.AdminPool, schedules[reportsOff.tenantID].discipline), "reports off: nothing runs")
	require.Zero(t, runCount(t, pg.AdminPool, schedules[reportsOff.tenantID].permits), "reports off: nothing runs")
	require.Zero(t, runCount(t, pg.AdminPool, schedules[disciplineOff.tenantID].discipline), "discipline off: its report is skipped")
	require.Equal(t, 1, runCount(t, pg.AdminPool, schedules[disciplineOff.tenantID].permits), "discipline off: other reports still run")

	emailed := map[uuid.UUID]bool{}
	for _, n := range pending {
		require.NotEqual(t, reportsOff.tenantID, n.TenantID)
		require.False(t, n.TenantID == disciplineOff.tenantID && n.ScheduleID == schedules[disciplineOff.tenantID].discipline)
		emailed[n.ScheduleID] = true
	}
	require.True(t, emailed[schedules[allOn.tenantID].permits], "the all-on tenant's permits report is ready to email")
	require.True(t, emailed[schedules[disciplineOff.tenantID].permits], "the discipline-off tenant's permits report is ready to email")
}
