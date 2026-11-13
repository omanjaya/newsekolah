package attendance

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// sessionViolationCount counts a student's discipline records tied to an
// attendance session.
func sessionViolationCount(t *testing.T, ctx context.Context, admin *pgxpool.Pool, sessionID, studentID uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, admin.QueryRow(ctx,
		`select count(*) from violation_records where attendance_session_id = $1 and student_user_id = $2`,
		sessionID, studentID).Scan(&n))
	return n
}

// TestSaveEntriesLeavesDisciplineAloneWhileDisciplineIsOff covers the
// always-on attendance module calling into discipline. With discipline
// turned off a save still succeeds, records no new violation even when
// violation ids are sent, and does not wipe the violations already
// recorded against the session; with discipline on, the same save
// replaces them as before.
func TestSaveEntriesLeavesDisciplineAloneWhileDisciplineIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})
	schedulingModule := scheduling.Register(pg.AppPool, events.NewBus(), noopPerms{})
	svc := service.New(
		pg.AppPool, repository.New(pg.AppPool), schoolModule.Service, schedulingModule.ScheduleReader, schedulingModule.AccessChecker,
		schedulingModule.JournalService, NoOpBlocker{}, NoOpOverrider{},
		wiring.DisciplineSessionViolations{Recorder: disciplineModule.Service, Flags: platformSvc},
		NoOpDisciplineReader{}, nil, nil, nil,
	)

	type fixture struct {
		w           world
		sessionID   uuid.UUID
		violationID uuid.UUID
	}
	setup := func(slug string) fixture {
		w := seedWorld(t, ctx, pg.AdminPool, slug)
		var violationID uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`insert into violation_types (tenant_id, code, name, points) values ($1, 'TLT', 'Terlambat', 5) returning id`,
			w.tenantID).Scan(&violationID))
		session, err := svc.OpenSession(ctx, w.tenantID, service.Actor{UserID: w.teacherID}, w.scheduleTodayID, w.today, domain.SaveModeNormal)
		require.NoError(t, err)
		// While discipline is still on, student1 gets a violation recorded
		// through attendance, as a homeroom teacher would.
		_, err = svc.SaveEntries(ctx, w.tenantID, service.Actor{UserID: w.teacherID}, session.Session.ID, service.SaveEntriesInput{
			Entries: []service.SaveEntryInput{
				{StudentUserID: w.student1ID, StatusCode: "H", ViolationIDs: []uuid.UUID{violationID}},
				{StudentUserID: w.student2ID, StatusCode: "H"},
			},
		})
		require.NoError(t, err)
		require.Equal(t, 1, sessionViolationCount(t, ctx, pg.AdminPool, session.Session.ID, w.student1ID))
		return fixture{w: w, sessionID: session.Session.ID, violationID: violationID}
	}
	on := setup("disc-on")
	off := setup("disc-off")

	_, err := platformSvc.SetFlag(ctx, off.w.tenantID, string(platformdomain.ModuleDiscipline), false)
	require.NoError(t, err)

	// The same save in both tenants: student1 without violation ids (what
	// the web sends once the violation catalogue is unavailable), student2
	// with one (an API client that still sends it).
	resave := func(f fixture) error {
		_, err := svc.SaveEntries(ctx, f.w.tenantID, service.Actor{UserID: f.w.teacherID}, f.sessionID, service.SaveEntriesInput{
			Entries: []service.SaveEntryInput{
				{StudentUserID: f.w.student1ID, StatusCode: "H"},
				{StudentUserID: f.w.student2ID, StatusCode: "H", ViolationIDs: []uuid.UUID{f.violationID}},
			},
		})
		return err
	}

	require.NoError(t, resave(on))
	require.Zero(t, sessionViolationCount(t, ctx, pg.AdminPool, on.sessionID, on.w.student1ID), "discipline on: the list is replaced")
	require.Equal(t, 1, sessionViolationCount(t, ctx, pg.AdminPool, on.sessionID, on.w.student2ID))

	require.NoError(t, resave(off), "discipline off: attendance still saves")
	require.Equal(t, 1, sessionViolationCount(t, ctx, pg.AdminPool, off.sessionID, off.w.student1ID), "discipline off: existing violations stay")
	require.Zero(t, sessionViolationCount(t, ctx, pg.AdminPool, off.sessionID, off.w.student2ID), "discipline off: no new violation")

	var statuses []string
	rows, err := pg.AdminPool.Query(ctx, `select status_code from attendance_entries where session_id = $1 order by student_user_id`, off.sessionID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var s string
		require.NoError(t, rows.Scan(&s))
		statuses = append(statuses, s)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{"H", "H"}, statuses, "the attendance entries themselves were saved")
}
