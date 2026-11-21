package staffattendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

const scheduleVersionsMigration = "0150_staff_attendance_schedule_versions"

type scheduleVersionRow struct {
	weekday       int16
	working       bool
	effectiveFrom time.Time
	createdAt     time.Time
}

func scheduleVersions(t *testing.T, ctx context.Context, pool *pgxpool.Pool, employee uuid.UUID) []scheduleVersionRow {
	t.Helper()
	rows, err := pool.Query(ctx, `
		select weekday, is_working_day, effective_from, created_at from staff_attendance_schedules
		where employee_user_id = $1 order by weekday, effective_from, created_at, id`, employee)
	require.NoError(t, err)
	defer rows.Close()
	var out []scheduleVersionRow
	for rows.Next() {
		var row scheduleVersionRow
		require.NoError(t, rows.Scan(&row.weekday, &row.working, &row.effectiveFrom, &row.createdAt))
		out = append(out, row)
	}
	require.NoError(t, rows.Err())
	return out
}

// TestScheduleVersionsMigrationKeepsEachPeriod replays migration 0150 on
// rows shaped by 0148: one row per weekday with the first-save date and,
// for a working day, when it last became one. A weekday that became a
// working day after the first save turns into two versions, a day off from
// the first save and a working day from the switch, both on the school's
// local date. The down migration folds the history back into one row per
// weekday, dating a working day from its latest unbroken working run.
func TestScheduleVersionsMigrationKeepsEachPeriod(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Staf Versi")
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	// 31 Aug 17:00 UTC is already 1 Sep 01:00 in Makassar.
	firstSave := time.Date(2026, 8, 31, 17, 0, 0, 0, time.UTC)
	wednesdayOn := time.Date(2026, 9, 1, 8, 0, 0, 0, loc)
	saturdayOn := time.Date(2026, 10, 10, 9, 0, 0, 0, loc)

	runMigrationFile(t, ctx, pg.AdminPool, scheduleVersionsMigration+".down.sql")
	// Monday: working from the first save. Wednesday: turned on later the
	// same local day. Saturday: off at first, working from 10 Oct. Sunday:
	// a day off throughout.
	for _, row := range []struct {
		weekday      int16
		working      bool
		workingSince *time.Time
	}{
		{1, true, &firstSave},
		{3, true, &wednesdayOn},
		{6, true, &saturdayOn},
		{7, false, nil},
	} {
		_, err := pg.AdminPool.Exec(ctx, `
			insert into staff_attendance_schedules
			  (tenant_id, employee_user_id, weekday, is_working_day, start_minute, end_minute, created_at, working_since)
			values ($1, $2, $3, $4, 480, 960, $5, $6)`,
			schoolID, employee, row.weekday, row.working, firstSave, row.workingSince)
		require.NoError(t, err)
	}

	runMigrationFile(t, ctx, pg.AdminPool, scheduleVersionsMigration+".up.sql")
	firstDate := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	versions := scheduleVersions(t, ctx, pg.AdminPool, employee)
	require.Len(t, versions, 5)
	for i, want := range []struct {
		weekday int16
		working bool
		from    time.Time
		savedAt time.Time
	}{
		{1, true, firstDate, firstSave},
		{3, true, firstDate, wednesdayOn},
		{6, false, firstDate, firstSave},
		{6, true, time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC), saturdayOn},
		{7, false, firstDate, firstSave},
	} {
		got := versions[i]
		require.Equal(t, want.weekday, got.weekday, "version %d", i)
		require.Equal(t, want.working, got.working, "version %d", i)
		require.True(t, want.from.Equal(got.effectiveFrom), "version %d takes effect on the school's local date, got %s", i, got.effectiveFrom)
		require.True(t, want.savedAt.Equal(got.createdAt), "version %d", i)
	}

	recap, err := mod.Service.GetMonthlyRecap(clock.WithTime(ctx, time.Date(2026, 10, 31, 18, 0, 0, 0, loc)), schoolID, employee, "2026-10")
	require.NoError(t, err)
	require.Len(t, recap.Days, 31)
	require.Equal(t, domain.StatusHoliday, recap.Days[2].StatusCode, "Saturday 3 Oct was still a day off")
	require.Equal(t, domain.StatusAbsent, recap.Days[9].StatusCode, "Saturday 10 Oct is a working day")
	require.Equal(t, domain.StatusHoliday, recap.Days[3].StatusCode, "Sunday is off")
	require.Equal(t, domain.StatusAbsent, recap.Days[4].StatusCode, "Monday works")
	require.Equal(t, domain.StatusUnscheduled, recap.Days[5].StatusCode, "Tuesday has no schedule")

	// Saturday off on 20 Oct, on again on 25 Oct, a later start on 27 Oct.
	saveOn := func(day int, saturdayWorking bool, saturdayStart int) {
		t.Helper()
		week := weekdaysSchedule(8*60, 16*60, 10)
		week[5].IsWorkingDay, week[5].StartMinute = saturdayWorking, saturdayStart
		_, err := mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, time.Date(2026, 10, day, 9, 0, 0, 0, loc)), schoolID, employee, employee, week)
		require.NoError(t, err)
	}
	saveOn(20, false, 8*60)
	saveOn(25, true, 8*60)
	saveOn(27, true, 9*60)

	runMigrationFile(t, ctx, pg.AdminPool, scheduleVersionsMigration+".down.sql")
	after := scheduleDatesByWeekday(t, ctx, pg.AdminPool, employee)
	require.Len(t, after, 7, "one row per weekday again")
	firstMidnight := time.Date(2026, 9, 1, 0, 0, 0, 0, loc)
	require.True(t, after[6].createdAt.Equal(firstMidnight), "Saturday dates from its first version")
	require.NotNil(t, after[6].workingSince)
	require.True(t, after[6].workingSince.Equal(time.Date(2026, 10, 25, 0, 0, 0, 0, loc)), "Saturday has worked since 25 Oct")
	require.True(t, after[7].createdAt.Equal(firstMidnight))
	require.Nil(t, after[7].workingSince, "Sunday is a day off")
	require.NotNil(t, after[1].workingSince)
	require.True(t, after[1].workingSince.Equal(firstMidnight), "a change of hours does not restart Monday's working run")
	var saturdayStart int16
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select start_minute from staff_attendance_schedules where employee_user_id = $1 and weekday = 6`, employee).Scan(&saturdayStart))
	require.Equal(t, int16(9*60), saturdayStart, "the latest version is the one kept")
	_, err = pg.AdminPool.Exec(ctx, `
		insert into staff_attendance_schedules (tenant_id, employee_user_id, weekday, is_working_day, start_minute, end_minute, working_since)
		values ($1, $2, 6, true, 480, 960, now())`, schoolID, employee)
	require.Error(t, err, "one row per weekday is enforced again")

	// Leave the schema as every other test in this database expects it.
	runMigrationFile(t, ctx, pg.AdminPool, scheduleVersionsMigration+".up.sql")
}
