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

// holidayCalendar marks one date of one class as a named holiday, standing
// in for wiring.ClassCalendar over the academic calendar.
type holidayCalendar struct {
	classID uuid.UUID
	date    time.Time
	name    string
}

func (h holidayCalendar) IsTeachingDay(_ context.Context, _, _, classID uuid.UUID, date time.Time) (bool, string, error) {
	if classID == h.classID && sameDate(date, h.date) {
		return false, h.name, nil
	}
	return true, "", nil
}

func sameDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

// A holiday in the academic calendar stops attendance: the day's list is
// empty and names the holiday, and neither opening nor saving a session
// for it is accepted -- even for a session that already existed before
// the holiday was declared. A date after today cannot be recorded ahead.
func TestHolidayAndFutureDateStopAttendance(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "holiday-guard")
	actor := service.Actor{UserID: w.teacherID}

	// The session exists before the holiday is entered in the calendar.
	before := buildService(pg.AppPool)
	opened, err := before.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)

	svc := buildService(pg.AppPool)
	svc.SetCalendar(holidayCalendar{classID: w.classID, date: w.today, name: "Libur Hari Guru"})

	day, err := svc.ListDay(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Empty(t, day.Sessions, "a holiday has no lessons to fill")
	require.Equal(t, "Libur Hari Guru", day.HolidayName)

	_, err = svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.ErrorIs(t, err, domain.ErrNotSchoolDay)

	_, err = svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
	})
	require.ErrorIs(t, err, domain.ErrNotSchoolDay)

	// Next week's lesson on the same weekday is an ordinary school day,
	// but it has not arrived yet.
	nextWeek := w.today.AddDate(0, 0, 7)
	_, err = svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, nextWeek, domain.SaveModeNormal)
	require.ErrorIs(t, err, domain.ErrSessionNotStarted)
}

// A lesson the teacher handed to an accepted substitute shows in the
// teacher's own list as handed over (not as an unfilled to-do), and its
// session records the substitute whoever opens the day's list first --
// including a session the teacher's list opened before the substitution
// was accepted.
func TestHandedOverLessonIsMarkedForTheOriginalTeacher(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "handed-over")

	// The teacher's list opens today's session with no substitute yet.
	sessions, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.False(t, sessions[0].Session.SubstituteUserID.Valid)

	_, err = pg.AdminPool.Exec(ctx,
		`insert into substitution_requests (tenant_id, academic_year_id, schedule_id, date, requester_user_id, substitute_user_id, status, responded_at)
		 values ($1, $2, $3, $4, $5, $6, 'accepted', now())`,
		w.tenantID, w.yearID, w.scheduleTodayID, w.today, w.teacherID, w.otherTeacherID,
	)
	require.NoError(t, err)

	own, err := svc.ListDay(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Len(t, own.Sessions, 1)
	require.False(t, own.Sessions[0].IsSubstitute)
	require.Equal(t, uuid.NullUUID{UUID: w.otherTeacherID, Valid: true}, own.Sessions[0].HandedOverTo)
	require.Equal(t, uuid.NullUUID{UUID: w.otherTeacherID, Valid: true}, own.Sessions[0].Session.SubstituteUserID,
		"the session opened before the substitution now records the substitute")

	theirs, err := svc.ListSessions(ctx, w.tenantID, w.otherTeacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Len(t, theirs, 1)
	require.True(t, theirs[0].IsSubstitute)
	require.False(t, theirs[0].HandedOverTo.Valid)
	require.Equal(t, own.Sessions[0].Session.ID, theirs[0].Session.ID, "both teachers see the one shared session")
}
