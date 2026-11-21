package staffattendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	migrationsfs "github.com/omanjaya/newsekolah/apps/api/migrations"
)

const workingSinceMigration = "0148_staff_attendance_schedule_working_since"

func runMigrationFile(t *testing.T, ctx context.Context, pool *pgxpool.Pool, name string) {
	t.Helper()
	sql, err := migrationsfs.FS.ReadFile(name)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, string(sql))
	require.NoError(t, err)
}

type scheduleDates struct {
	createdAt    time.Time
	workingSince *time.Time
}

func scheduleDatesByWeekday(t *testing.T, ctx context.Context, pool *pgxpool.Pool, employee uuid.UUID) map[int16]scheduleDates {
	t.Helper()
	rows, err := pool.Query(ctx,
		`select weekday, created_at, working_since from staff_attendance_schedules where employee_user_id = $1`, employee)
	require.NoError(t, err)
	defer rows.Close()
	out := map[int16]scheduleDates{}
	for rows.Next() {
		var weekday int16
		var dates scheduleDates
		require.NoError(t, rows.Scan(&weekday, &dates.createdAt, &dates.workingSince))
		out[weekday] = dates
	}
	require.NoError(t, rows.Err())
	return out
}

// TestWorkingSinceMigrationRestoresFirstSaveDate replays migration 0148 on
// rows shaped by the rule before it, where turning a day off into a working
// day re-dated created_at. Every re-dated row gets the first-save date back,
// a weekday turned on and off again included, so its earlier days read as
// days off rather than unscheduled; working_since keeps when a working
// weekday last became one. The down migration puts that date back.
func TestWorkingSinceMigrationRestoresFirstSaveDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	_, schoolID, employee, loc := makassarStaff(t, pg, "Staf Migrasi")

	firstSave := time.Date(2026, 9, 1, 9, 0, 0, 0, loc)
	mondayOn := time.Date(2026, 10, 5, 9, 0, 0, 0, loc)
	saturdayOn := time.Date(2026, 10, 10, 9, 0, 0, 0, loc)

	runMigrationFile(t, ctx, pg.AdminPool, scheduleVersionsMigration+".down.sql")
	runMigrationFile(t, ctx, pg.AdminPool, workingSinceMigration+".down.sql")
	// Monday: working, re-dated when it became one. Tuesday: working from
	// the first save. Saturday: re-dated when it became working, then
	// turned off again. Sunday: a day off from the first save.
	for _, row := range []struct {
		weekday   int16
		working   bool
		createdAt time.Time
	}{
		{1, true, mondayOn},
		{2, true, firstSave},
		{6, false, saturdayOn},
		{7, false, firstSave},
	} {
		_, err := pg.AdminPool.Exec(ctx, `
			insert into staff_attendance_schedules
			  (tenant_id, employee_user_id, weekday, is_working_day, start_minute, end_minute, created_at)
			values ($1, $2, $3, $4, 480, 960, $5)`,
			schoolID, employee, row.weekday, row.working, row.createdAt)
		require.NoError(t, err)
	}

	runMigrationFile(t, ctx, pg.AdminPool, workingSinceMigration+".up.sql")
	after := scheduleDatesByWeekday(t, ctx, pg.AdminPool, employee)
	for weekday, dates := range after {
		require.True(t, dates.createdAt.Equal(firstSave), "weekday %d dates from the first save", weekday)
	}
	require.NotNil(t, after[1].workingSince)
	require.True(t, after[1].workingSince.Equal(mondayOn), "Monday has been working since it was turned on")
	require.NotNil(t, after[2].workingSince)
	require.True(t, after[2].workingSince.Equal(firstSave))
	require.Nil(t, after[6].workingSince, "Saturday is a day off again")
	require.Nil(t, after[7].workingSince)

	runMigrationFile(t, ctx, pg.AdminPool, workingSinceMigration+".down.sql")
	var hasColumn bool
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `
		select exists (select 1 from information_schema.columns
		  where table_name = 'staff_attendance_schedules' and column_name = 'working_since')`).Scan(&hasColumn))
	require.False(t, hasColumn)
	var mondayCreated, tuesdayCreated time.Time
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select created_at from staff_attendance_schedules where employee_user_id = $1 and weekday = 1`, employee).Scan(&mondayCreated))
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select created_at from staff_attendance_schedules where employee_user_id = $1 and weekday = 2`, employee).Scan(&tuesdayCreated))
	require.True(t, mondayCreated.Equal(mondayOn), "down dates a working row from when it became one")
	require.True(t, tuesdayCreated.Equal(firstSave))

	// Leave the schema as every other test in this database expects it.
	runMigrationFile(t, ctx, pg.AdminPool, workingSinceMigration+".up.sql")
	runMigrationFile(t, ctx, pg.AdminPool, scheduleVersionsMigration+".up.sql")
}
