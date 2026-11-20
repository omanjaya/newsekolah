package attendance

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// Browsing a later day lists its lessons without opening them: no session
// row is written, so the timetable block behind the lesson is not frozen
// as history by a teacher merely looking ahead. A day that has come is
// still opened, so its rows carry an ID the teacher can act on.
func TestListingALaterDayOpensNoSession(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "future-listing")
	countSessions := func() int {
		t.Helper()
		var n int
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`select count(*) from attendance_sessions where tenant_id = $1`, w.tenantID).Scan(&n))
		return n
	}

	nextWeek := w.today.AddDate(0, 0, 7)
	for range 2 {
		sessions, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &nextWeek})
		require.NoError(t, err)
		require.Len(t, sessions, 1, "the lesson is still listed")
		require.Equal(t, uuid.Nil, sessions[0].Session.ID, "but not opened")
		require.Equal(t, w.scheduleTodayID, sessions[0].Session.ScheduleID)
		require.False(t, sessions[0].StartsAt.IsZero())
	}
	require.Zero(t, countSessions(), "viewing a later day writes nothing")

	today, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Len(t, today, 1)
	require.NotEqual(t, uuid.Nil, today[0].Session.ID, "today's lesson is opened")
	require.Equal(t, 1, countSessions())
}

// The daily report's per-session detail keeps the entry of a student who
// has since left the class -- it is that lesson's record -- but marks it,
// so it is no mystery next to a student table that lists the current
// roster only.
func TestDailyReportMarksEntriesOfStudentsWhoLeftTheClass(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "report-left-class")
	actor := service.Actor{UserID: w.teacherID}

	opened, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{
			{StudentUserID: w.student1ID, StatusCode: "H"},
			{StudentUserID: w.student2ID, StatusCode: "A"},
		},
	})
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx,
		`update enrollments set status = 'left', left_on = current_date where tenant_id = $1 and student_user_id = $2`,
		w.tenantID, w.student2ID)
	require.NoError(t, err)

	report, err := svc.GetDailyReport(ctx, w.tenantID, w.classID, w.today)
	require.NoError(t, err)
	require.Len(t, report.Students, 1, "the student table is the current roster")
	require.Len(t, report.Sessions, 1)
	entries := report.Sessions[0].Entries
	require.Len(t, entries, 2, "the lesson's record keeps both entries")
	require.Equal(t, w.student1ID, entries[0].StudentUserID, "the current roster comes first")
	require.False(t, entries[0].LeftClass)
	require.Equal(t, w.student2ID, entries[1].StudentUserID)
	require.True(t, entries[1].LeftClass)

	own, err := svc.GetOwnDailyReport(ctx, w.tenantID, w.teacherID, w.today)
	require.NoError(t, err)
	require.Len(t, own, 1)
	require.True(t, own[0].Entries[1].LeftClass, "the teacher's own report marks it too")
}

// A lesson handed to an accepted substitute is theirs to fill: its own
// teacher may still open it, sees it marked handed over, and cannot save
// it as its owner any more.
func TestHandedOverLessonIsReadOnlyForItsOwnTeacher(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "handed-over-owner")
	_, err := pg.AdminPool.Exec(ctx,
		`insert into substitution_requests (tenant_id, academic_year_id, schedule_id, date, requester_user_id, substitute_user_id, status, responded_at)
		 values ($1, $2, $3, $4, $5, $6, 'accepted', now())`,
		w.tenantID, w.yearID, w.scheduleYesterdayID, w.yesterday, w.teacherID, w.otherTeacherID,
	)
	require.NoError(t, err)
	// The handed-over lesson is yesterday's: the seeded teacher is also
	// the class's homeroom teacher, so drop that duty to see the plain
	// subject-teacher case.
	_, err = pg.AdminPool.Exec(ctx, `delete from duty_assignments where tenant_id = $1`, w.tenantID)
	require.NoError(t, err)

	owner := service.Actor{UserID: w.teacherID}
	opened, err := svc.OpenSession(ctx, w.tenantID, owner, w.scheduleYesterdayID, w.yesterday, domain.SaveModeNormal)
	require.NoError(t, err)
	require.Equal(t, uuid.NullUUID{UUID: w.otherTeacherID, Valid: true}, opened.HandedOverTo)
	require.Equal(t, domain.SaveModeCorrection, opened.SaveMode)
	require.Nil(t, opened.EditableUntil, "the owner may not save it in any mode")

	detail, err := svc.GetSessionDetail(ctx, w.tenantID, owner, opened.Session.ID)
	require.NoError(t, err, "the owner can still look at it")
	require.True(t, detail.HandedOverTo.Valid)

	input := service.SaveEntriesInput{Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}}}
	_, err = svc.SaveEntries(ctx, w.tenantID, owner, opened.Session.ID, input)
	require.ErrorIs(t, err, domain.ErrNoAccess)

	substitute := service.Actor{UserID: w.otherTeacherID}
	theirs, err := svc.GetSessionDetail(ctx, w.tenantID, substitute, opened.Session.ID)
	require.NoError(t, err)
	require.False(t, theirs.HandedOverTo.Valid)
	require.Equal(t, domain.SaveModeNormal, theirs.SaveMode)
	_, err = svc.SaveEntries(ctx, w.tenantID, substitute, opened.Session.ID, input)
	require.NoError(t, err, "the substitute saves it")
}
