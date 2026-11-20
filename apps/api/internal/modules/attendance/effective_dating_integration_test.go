package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// The timetable changed from today on (migration 0147): until last week
// the class had two lessons on this weekday with the seeded teacher (P1
// and P2), from today one lesson with the other teacher. Every reader that
// asks which lessons take place on a date -- the teacher's day list (and
// so the teacher home's "Mengajar hari ini"), opening a session, the daily
// report, the daily summary, the student calendar, the batch day statuses
// and the monitor -- must see the version in effect on that date.
func TestReadersFollowTheTimetableVersionInEffect(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "effective-readers")
	admin := pg.AdminPool
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := admin.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	lastWeek := w.today.AddDate(0, 0, -7)
	weekday := domain.IsoWeekday(w.today)

	// The students were in the class all along.
	exec(`update enrollments set joined_on = '2025-01-01' where tenant_id = $1`, w.tenantID)

	var templateID, p2 uuid.UUID
	require.NoError(t, admin.QueryRow(ctx, `select template_id from periods where id = $1`, w.periodID).Scan(&templateID))
	require.NoError(t, admin.QueryRow(ctx,
		`insert into periods (tenant_id, template_id, name, sequence, starts_at, ends_at) values ($1, $2, 'P2', 2, '00:01', '23:59') returning id`,
		w.tenantID, templateID).Scan(&p2))

	// Old timetable: P1 (seedWorld's scheduleToday) and P2, both ending
	// last week. New timetable: P1 with the other teacher from today.
	exec(`update schedules set effective_until = $2 where id = $1`, w.scheduleTodayID, lastWeek)
	var oldP2, newP1 uuid.UUID
	require.NoError(t, admin.QueryRow(ctx,
		`insert into schedules (tenant_id, academic_year_id, class_id, subject_id, teacher_user_id, day_of_week, start_period_id, end_period_id, start_seq, end_seq, source, effective_from, effective_until)
		 values ($1, $2, $3, $4, $5, $6, $7, $7, 2, 2, 'admin', '2025-01-01', $8) returning id`,
		w.tenantID, w.yearID, w.classID, w.subjectID, w.teacherID, weekday, p2, lastWeek).Scan(&oldP2))
	require.NoError(t, admin.QueryRow(ctx,
		`insert into schedules (tenant_id, academic_year_id, class_id, subject_id, teacher_user_id, day_of_week, start_period_id, end_period_id, start_seq, end_seq, source, effective_from)
		 values ($1, $2, $3, $4, $5, $6, $7, $7, 1, 1, 'admin', $8) returning id`,
		w.tenantID, w.yearID, w.classID, w.subjectID, w.otherTeacherID, weekday, w.periodID, w.today).Scan(&newP1))

	// Last week's two lessons were held and submitted, everyone present.
	for _, sched := range []struct {
		id, period uuid.UUID
	}{{w.scheduleTodayID, w.periodID}, {oldP2, p2}} {
		var sessionID uuid.UUID
		require.NoError(t, admin.QueryRow(ctx,
			`insert into attendance_sessions (tenant_id, academic_year_id, schedule_id, date, class_id, subject_id, teacher_user_id, start_period_id, end_period_id, submitted_at)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $8, now()) returning id`,
			w.tenantID, w.yearID, sched.id, lastWeek, w.classID, w.subjectID, w.teacherID, sched.period).Scan(&sessionID))
		for _, student := range []uuid.UUID{w.student1ID, w.student2ID} {
			exec(`insert into attendance_entries (tenant_id, session_id, student_user_id, status_code) values ($1, $2, $3, 'H')`, w.tenantID, sessionID, student)
		}
	}

	scheduleIDs := func(sessions []service.SessionSummary) []uuid.UUID {
		out := make([]uuid.UUID, len(sessions))
		for i, s := range sessions {
			out[i] = s.Session.ScheduleID
		}
		return out
	}

	// The day list: last week the seeded teacher had both old lessons;
	// today they have none and the other teacher has the new one. With no
	// date (the teacher home's "Mengajar hari ini") it is today's list.
	got, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &lastWeek})
	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{w.scheduleTodayID, oldP2}, scheduleIDs(got))
	got, err = svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Empty(t, got)
	got, err = svc.ListSessions(ctx, w.tenantID, w.otherTeacherID, service.ListSessionsOptions{})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{newP1}, scheduleIDs(got))
	got, err = svc.ListSessions(ctx, w.tenantID, w.otherTeacherID, service.ListSessionsOptions{Date: &lastWeek})
	require.NoError(t, err)
	require.Empty(t, got, "the new lesson did not exist last week")

	// The retired version cannot be opened for a date after it ended, but
	// stays open for its own dates (a correction).
	owner := service.Actor{UserID: w.teacherID}
	_, err = svc.OpenSession(ctx, w.tenantID, owner, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.ErrorIs(t, err, domain.ErrLessonNotOnDate)
	_, err = svc.OpenSession(ctx, w.tenantID, owner, w.scheduleTodayID, lastWeek, domain.SaveModeNormal)
	require.NoError(t, err)

	// Today's new lesson is held: the daily summary expects one lesson.
	newTeacher := service.Actor{UserID: w.otherTeacherID}
	opened, err := svc.OpenSession(ctx, w.tenantID, newTeacher, newP1, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, newTeacher, opened.Session.ID, service.SaveEntriesInput{Entries: []service.SaveEntryInput{
		{StudentUserID: w.student1ID, StatusCode: "H"}, {StudentUserID: w.student2ID, StatusCode: "H"},
	}})
	require.NoError(t, err)
	var expected int
	var status string
	require.NoError(t, admin.QueryRow(ctx,
		`select expected_sessions, status_code from attendance_daily_summary where student_user_id = $1 and date = $2`,
		w.student1ID, w.today).Scan(&expected, &status))
	require.Equal(t, 1, expected)
	require.Equal(t, "H", status)

	// The daily report (homeroom view, exports) counts per date.
	report, err := svc.GetDailyReport(ctx, w.tenantID, w.classID, lastWeek)
	require.NoError(t, err)
	require.Equal(t, 2, report.ExpectedSessions)
	report, err = svc.GetDailyReport(ctx, w.tenantID, w.classID, w.today)
	require.NoError(t, err)
	require.Equal(t, 1, report.ExpectedSessions)
	require.True(t, report.Complete)

	// Computed live (no summary rows), the student calendar and the batch
	// day statuses analytics and reports read agree: every lesson in
	// effect was held, so both days are present, not incomplete.
	exec(`delete from attendance_daily_summary where tenant_id = $1`, w.tenantID)
	calendarDay := func(date string) service.CalendarDay {
		t.Helper()
		days, err := svc.GetStudentCalendarMonth(ctx, w.tenantID, w.student1ID, date[:7])
		require.NoError(t, err)
		for _, d := range days {
			if d.Date.Format("2006-01-02") == date {
				return d
			}
		}
		t.Fatalf("no calendar day %s", date)
		return service.CalendarDay{}
	}
	lastWeekDay := calendarDay(lastWeek.Format("2006-01-02"))
	require.Equal(t, 2, lastWeekDay.ExpectedSessions)
	require.Equal(t, "H", lastWeekDay.StatusCode)
	todayDay := calendarDay(w.today.Format("2006-01-02"))
	require.Equal(t, 1, todayDay.ExpectedSessions)
	require.Equal(t, "H", todayDay.StatusCode)
	statuses, err := svc.DayStatusesForStudents(ctx, w.tenantID, []uuid.UUID{w.student1ID}, []time.Time{lastWeek, w.today})
	require.NoError(t, err)
	require.Len(t, statuses, 2)
	for _, s := range statuses {
		require.Equal(t, "H", s.StatusCode, s.Date)
	}

	// The monitor shows today's lesson only, with its new teacher.
	snapshot, err := svc.GetMonitorSnapshot(ctx, w.tenantID)
	require.NoError(t, err)
	require.Len(t, snapshot.Sessions, 1)
	require.Equal(t, "X-A", snapshot.Sessions[0].ClassName)
	require.Equal(t, "Other Teacher", snapshot.Sessions[0].TeacherName)
	require.Equal(t, "submitted", snapshot.Sessions[0].Status)
	submitted, total, err := svc.TodaySubmittedCount(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, submitted)
	require.Equal(t, 1, total)
}
