package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func TestSimulatedAttendanceDayAndSaveWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "simulated-attendance")
	_, err := pg.AdminPool.Exec(ctx, "update tenants set timezone = 'Asia/Makassar' where id = $1", w.tenantID)
	require.NoError(t, err)
	svc := buildService(pg.AppPool).WithClock(clock.Frozen{At: w.today.Add(4 * time.Hour)})
	loc, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	y, m, d := w.yesterday.Date()
	at := time.Date(y, m, d, 6, 45, 0, 0, loc)
	simCtx := clock.WithTime(ctx, at.UTC())

	sessions, err := svc.ListSessions(simCtx, w.tenantID, w.teacherID, service.ListSessionsOptions{CurrentOnly: true})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Equal(t, w.scheduleYesterdayID, sessions[0].Session.ScheduleID)
	require.Equal(t, at.Format("2006-01-02"), sessions[0].Session.Date.Format("2006-01-02"))
	monitor, err := svc.GetMonitorSnapshot(simCtx, w.tenantID)
	require.NoError(t, err)
	require.True(t, at.Equal(monitor.GeneratedAt))
	require.Equal(t, at.Format("2006-01-02"), monitor.Date.Format("2006-01-02"))

	input := service.SaveEntriesInput{Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}}}
	actor := service.Actor{UserID: w.teacherID}
	_, err = svc.SaveEntries(simCtx, w.tenantID, actor, sessions[0].Session.ID, input)
	require.NoError(t, err)
	_, err = svc.SaveEntries(clock.WithTime(ctx, at.AddDate(0, 0, 10)), w.tenantID, actor, sessions[0].Session.ID, input)
	require.ErrorIs(t, err, domain.ErrSaveWindowClosed)

	actual, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{})
	require.NoError(t, err)
	require.Len(t, actual, 1)
	require.Equal(t, w.scheduleTodayID, actual[0].Session.ScheduleID, "other requests retain their original clock")
}

// TestHomeroomGlobalCorrectorScopeFollowsDutyWindow proves the "wali
// kelas" (homeroom) global-corrector scope check --
// GetHomeroomClassForTeacher, backed by queries/cross_reads.sql's
// GetHomeroomClassForAttendance -- decides which class a teacher may
// correct from the business date the caller passes (the attendance
// record's own date, ultimately sourced from clock.Now(ctx, s.clock) at
// the handler/session layer whenever no explicit date is given) instead
// of always the database server's current_date. seedWorld's homeroom duty
// is moved to a window 10..20 days out, so the real "today" falls outside
// it: GetHomeroomAttendance must reject the teacher then, and accept them
// once the date argument falls inside the window.
func TestHomeroomGlobalCorrectorScopeFollowsDutyWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "homeroom-window")

	windowStart := w.today.AddDate(0, 0, 10)
	windowEnd := w.today.AddDate(0, 0, 20)
	_, err := pg.AdminPool.Exec(ctx,
		`update duty_assignments set starts_on = $1, ends_on = $2 where tenant_id = $3 and user_id = $4 and academic_year_id = $5`,
		windowStart, windowEnd, w.tenantID, w.teacherID, w.yearID)
	require.NoError(t, err)

	svc := buildService(pg.AppPool)
	actor := service.Actor{UserID: w.teacherID}

	_, err = svc.GetHomeroomAttendance(ctx, w.tenantID, actor, w.today, service.HomeroomFilter{})
	require.ErrorIs(t, err, domain.ErrNotHomeroomTeacher, "today is before the duty's starts_on: the teacher must not be treated as homeroom yet")

	insideWindow := windowStart.AddDate(0, 0, 3)
	roster, err := svc.GetHomeroomAttendance(ctx, w.tenantID, actor, insideWindow, service.HomeroomFilter{})
	require.NoError(t, err, "a date inside the duty's window must let the homeroom teacher see the roster")
	require.Equal(t, 2, roster.Total)

	afterWindow := windowEnd.AddDate(0, 0, 1)
	_, err = svc.GetHomeroomAttendance(ctx, w.tenantID, actor, afterWindow, service.HomeroomFilter{})
	require.ErrorIs(t, err, domain.ErrNotHomeroomTeacher, "a date past ends_on must reject the teacher again")
}

// TestAcceptedSubstitutionAppearsUnderSimulatedDay proves ListSessions --
// the "today's sessions" merge of a teacher's own schedules plus their
// accepted substitutions -- resolves "today" from the simulated business
// clock (clock.Now(ctx, s.clock)) before asking scheduling's
// ScheduleReaderAdapter.ListAcceptedSubstitutionsForSubstituteDate for
// that exact date, so an accepted substitution two days out from seedWorld's
// "today" is invisible under the real clock and appears once a simulated
// time on that date is attached to ctx.
func TestAcceptedSubstitutionAppearsUnderSimulatedDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "sub-sim")

	q := db.New(pg.AdminPool)
	subDate := w.today.AddDate(0, 0, 2)
	otherSchedule, err := q.CreateSchedule(ctx, db.CreateScheduleParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, ClassID: w.classID, SubjectID: w.subjectID, TeacherUserID: w.otherTeacherID,
		DayOfWeek: domain.IsoWeekday(subDate), StartPeriodID: w.periodID, EndPeriodID: w.periodID, StartSeq: 1, EndSeq: 1, Source: "admin",
	})
	require.NoError(t, err)

	_, err = pg.AdminPool.Exec(ctx,
		`insert into substitution_requests (tenant_id, academic_year_id, schedule_id, date, requester_user_id, substitute_user_id, status)
		 values ($1, $2, $3, $4, $5, $6, 'accepted')`,
		w.tenantID, w.yearID, otherSchedule.ID, subDate, w.otherTeacherID, w.teacherID)
	require.NoError(t, err)

	svc := buildService(pg.AppPool)

	real, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	for _, s := range real {
		require.NotEqual(t, otherSchedule.ID, s.Session.ScheduleID, "the substitution's own date has not arrived under the real clock")
	}

	simCtx := clock.WithTime(ctx, subDate.Add(6*time.Hour))
	simulated, err := svc.ListSessions(simCtx, w.tenantID, w.teacherID, service.ListSessionsOptions{})
	require.NoError(t, err)
	require.Len(t, simulated, 1)
	require.Equal(t, otherSchedule.ID, simulated[0].Session.ScheduleID)
	require.True(t, simulated[0].IsSubstitute, "the merged session must be flagged as a substitution, not the teacher's own schedule")
}
