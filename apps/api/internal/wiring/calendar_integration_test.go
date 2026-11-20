package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
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
	classXIA := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'XI-A')`, tenantID, yearID, gradeXI)
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

	// The batch read gives the same answers for a whole range: Tue 24,
	// Thu 26 and Fri 27 for X-A (Wed 25 is the holiday), and only Tue 24
	// and Fri 27 for XI-A, whose trip is on Thu 26. The weekend has none.
	byClass, err := calendar.TeachingDays(ctx, tenantID, yearID, []uuid.UUID{classXA, classXIA, classXA}, day("2026-11-24"), day("2026-11-29"))
	require.NoError(t, err)
	require.Equal(t, []time.Time{day("2026-11-24"), day("2026-11-26"), day("2026-11-27")}, byClass[classXA])
	require.Equal(t, []time.Time{day("2026-11-24"), day("2026-11-27")}, byClass[classXIA])
}

// A school day is a teaching day for a class only when its timetable has a
// lesson that weekday: with all seven days active in the school week, a
// class timetabled Tuesday and Friday has no lessons on the weekend or on
// Monday to Thursday, and a holiday still names itself (audit S13). A leave
// from Friday 12 to Tuesday 16 February 2027 therefore covers two of its
// lesson days, which is what attendance applies and permits counts.
func TestClassCalendarKeepsOnlyTheClassTimetabledWeekdays(t *testing.T) {
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

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('class-timetable','Test','sma','Asia/Makassar','id','active','default')`)
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-01','2027-06-30')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	classXB := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-B')`, tenantID, yearID, grade)
	classXC := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-C')`, tenantID, yearID, grade)
	for day := 1; day <= 7; day++ {
		exec(`insert into school_days (tenant_id,academic_year_id,day_of_week,is_active) values ($1,$2,$3,true)`, tenantID, yearID, day)
	}
	exec(`insert into academic_calendar_events (tenant_id,academic_year_id,date,end_date,kind,name) values ($1,$2,'2027-02-15','2027-02-15','holiday','Cuti bersama')`, tenantID, yearID)
	subject := insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Matematika')`, tenantID)
	template := insertID(`insert into period_templates (tenant_id,name) values ($1,'Default')`, tenantID)
	period := insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P1',1,'07:00','08:00')`, tenantID, template)
	teacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'guru-timetable','x','Guru','active','id')`, tenantID)
	// X-B has lessons on Tuesday and Friday; X-C has no timetable yet.
	for _, weekday := range []int{2, 5} {
		exec(`insert into schedules (tenant_id,academic_year_id,class_id,subject_id,teacher_user_id,day_of_week,start_period_id,end_period_id,start_seq,end_seq,source,effective_from)
			values ($1,$2,$3,$4,$5,$6,$7,$7,1,1,'admin','2026-07-01')`, tenantID, yearID, classXB, subject, teacher, weekday, period)
	}

	academicModule := academic.Register(pg.AppPool, clock.Real{})
	schedulingModule := scheduling.Register(pg.AppPool, events.NewBus(), allowNothing{})
	calendar := ClassCalendar{Calendar: academicModule.Service, Classes: academicModule.Service, Schedules: schedulingModule.ScheduleReader}
	day := func(iso string) time.Time {
		d, err := time.Parse(time.DateOnly, iso)
		require.NoError(t, err)
		return d
	}

	for iso, want := range map[string]bool{
		"2027-02-12": true,  // Friday
		"2027-02-13": false, // Saturday: a school day, but no X-B lesson
		"2027-02-14": false, // Sunday
		"2027-02-16": true,  // Tuesday
		"2027-02-17": false, // Wednesday
	} {
		teaching, name, err := calendar.IsTeachingDay(ctx, tenantID, yearID, classXB, day(iso))
		require.NoError(t, err)
		require.Equal(t, want, teaching, iso)
		require.Empty(t, name, iso)
	}
	teaching, name, err := calendar.IsTeachingDay(ctx, tenantID, yearID, classXB, day("2027-02-15"))
	require.NoError(t, err)
	require.False(t, teaching)
	require.Equal(t, "Cuti bersama", name, "a holiday is still named")

	byClass, err := calendar.TeachingDays(ctx, tenantID, yearID, []uuid.UUID{classXB, classXC}, day("2027-02-12"), day("2027-02-16"))
	require.NoError(t, err)
	require.Equal(t, []time.Time{day("2027-02-12"), day("2027-02-16")}, byClass[classXB])
	require.Empty(t, byClass[classXC], "a class with no timetable has no lesson days")
	require.Contains(t, byClass, classXC)
}
