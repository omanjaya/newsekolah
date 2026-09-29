package scheduling_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// mustParseDate is defined in schedule_integration_test.go, shared by
// every _test.go file in this package.

// TestAcceptedSubstitutionsAreScopedToTheirOwnDate proves
// ScheduleReaderAdapter.ListAcceptedSubstitutionsForSubstituteDate --
// scheduling's exported cross-module read that attendance's
// service.ListSessions calls with a date resolved from
// clock.Now(ctx, s.clock) (see internal/modules/attendance/service/
// session.go) -- returns a substitute teacher's accepted coverage for
// exactly the date asked, never a neighbouring day. This is the boundary
// "substitutions valid today" rests on: scheduling itself holds no
// server-clock opinion about which day is "today" (every date-based query
// here already takes date as a parameter, per docs/testing-time-
// simulation.md), so the simulated/real business date a caller picks
// fully determines what comes back.
func TestAcceptedSubstitutionsAreScopedToTheirOwnDate(t *testing.T) {
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

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('sub-sim-test','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, year, grade)
	subject := insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Math')`, tenantID)
	teacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher','x','Teacher','active','id')`, tenantID)
	substitute := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'substitute','x','Substitute','active','id')`, tenantID)
	template := insertID(`insert into period_templates (tenant_id,name) values ($1,'Default')`, tenantID)
	period := insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P1',1,'08:00','09:00')`, tenantID, template)
	exec(`insert into school_days (tenant_id,academic_year_id,day_of_week) values ($1,$2,1)`, tenantID, year)
	exec(`insert into period_day_assignments (tenant_id,academic_year_id,day_of_week,template_id) values ($1,$2,1,$3)`, tenantID, year, template)
	exec(`insert into teaching_assignments (tenant_id,academic_year_id,teacher_user_id,subject_id,class_id) values ($1,$2,$3,$4,$5)`, tenantID, year, teacher, subject, class)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool))
	actor := service.Actor{CanManage: true, UserID: teacher}
	schedule, err := svc.CreateSchedule(ctx, tenantID, service.ScheduleInput{
		AcademicYearID: year, ClassID: class, SubjectID: subject, TeacherUserID: teacher,
		DayOfWeek: 1, StartPeriodID: period, EndPeriodID: period, Source: domain.SourceAdmin,
	}, actor)
	require.NoError(t, err)

	theDate := "2026-09-28" // a Monday, matching day_of_week 1 above
	otherDate := "2026-10-05"
	exec(`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status)
	      values ($1,$2,$3,$4,$5,$6,'accepted')`, tenantID, year, schedule.ID, theDate, teacher, substitute)

	reader := service.NewScheduleReaderAdapter(svc)

	onDate, err := reader.ListAcceptedSubstitutionsForSubstituteDate(ctx, tenantID, substitute, mustParseDate(t, theDate))
	require.NoError(t, err)
	require.Len(t, onDate, 1)
	require.Equal(t, schedule.ID, onDate[0].ID)

	onOtherDate, err := reader.ListAcceptedSubstitutionsForSubstituteDate(ctx, tenantID, substitute, mustParseDate(t, otherDate))
	require.NoError(t, err)
	require.Empty(t, onOtherDate, "a neighbouring date must not see another day's accepted substitution")
}
