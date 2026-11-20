package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// ClassCalendar reads the real academic calendar for one class: a
// school-wide holiday cancels lessons and is named, an event scoped to
// another grade level does not, and an ordinary weekday is a teaching day.
func TestClassCalendarScopesHolidaysToTheClassGrade(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('class-calendar','Test','sma','Asia/Makassar','id','active','default')`)
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-01','2027-06-30')`, tenantID)
	gradeX := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	gradeXI := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'XI','XI',2)`, tenantID)
	classXA := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, yearID, gradeX)
	for day := 1; day <= 5; day++ {
		exec(`insert into school_days (tenant_id,academic_year_id,day_of_week,is_active) values ($1,$2,$3,true)`, tenantID, yearID, day)
	}
	exec(`insert into academic_calendar_events (tenant_id,academic_year_id,date,end_date,kind,name) values ($1,$2,'2026-11-25','2026-11-25','holiday','Hari Guru')`, tenantID, yearID)
	trip := insertID(`insert into academic_calendar_events (tenant_id,academic_year_id,date,end_date,kind,name) values ($1,$2,'2026-11-26','2026-11-26','no_school','Studi wisata XI')`, tenantID, yearID)
	exec(`insert into academic_calendar_event_grade_levels (tenant_id,calendar_event_id,grade_level_id) values ($1,$2,$3)`, tenantID, trip, gradeXI)

	academicModule := academic.Register(pg.AppPool, clock.Real{})
	calendar := ClassCalendar{Calendar: academicModule.Service, Classes: academicModule.Service}
	day := func(iso string) time.Time {
		d, err := time.Parse(time.DateOnly, iso)
		require.NoError(t, err)
		return d
	}

	teaching, name, err := calendar.IsTeachingDay(ctx, tenantID, yearID, classXA, day("2026-11-25"))
	require.NoError(t, err)
	require.False(t, teaching)
	require.Equal(t, "Hari Guru", name)

	teaching, _, err = calendar.IsTeachingDay(ctx, tenantID, yearID, classXA, day("2026-11-26"))
	require.NoError(t, err)
	require.True(t, teaching, "a day off for grade XI does not cancel grade X's lessons")

	teaching, _, err = calendar.IsTeachingDay(ctx, tenantID, yearID, classXA, day("2026-11-24"))
	require.NoError(t, err)
	require.True(t, teaching)
}
