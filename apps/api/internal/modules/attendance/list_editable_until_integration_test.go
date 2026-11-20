package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestListedSessionsCarryTheViewersSaveDeadline: the day list gives each
// opened session the same editable_until the session detail gives its
// viewer, so the list's badge follows the server's save window instead of
// a date-only rule (audit attendance-time-R1). The owner saves until the
// correction deadline (the session date plus 7 days by default); someone
// who may not save it at all gets none.
func TestListedSessionsCarryTheViewersSaveDeadline(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "list-editable-until")
	owner := service.Actor{UserID: w.teacherID}

	deadline := func(date time.Time) time.Time {
		return domain.CorrectionDeadline(date, 7, time.UTC)
	}

	for _, date := range []time.Time{w.today, w.today.AddDate(0, 0, -7), w.today.AddDate(0, 0, -14)} {
		sessions, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &date, Viewer: &owner})
		require.NoError(t, err)
		require.Len(t, sessions, 1, date.Format(time.DateOnly))
		require.NotNil(t, sessions[0].EditableUntil, date.Format(time.DateOnly))
		require.True(t, deadline(date).Equal(*sessions[0].EditableUntil), "%s: %s", date.Format(time.DateOnly), sessions[0].EditableUntil)

		detail, err := svc.GetSessionDetail(ctx, w.tenantID, owner, sessions[0].Session.ID)
		require.NoError(t, err)
		require.True(t, detail.EditableUntil.Equal(*sessions[0].EditableUntil), "the list and the detail agree")
	}

	// A manager looking at someone else's day without correction rights
	// may not save the session at all.
	manager := service.Actor{UserID: w.otherTeacherID, CanManage: true}
	sessions, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today, Viewer: &manager})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Nil(t, sessions[0].EditableUntil)

	// A global corrector gets the correction deadline.
	corrector := service.Actor{UserID: w.otherTeacherID, CanManage: true, IsGlobalCorrector: true}
	sessions, err = svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today, Viewer: &corrector})
	require.NoError(t, err)
	require.NotNil(t, sessions[0].EditableUntil)
	require.True(t, deadline(w.today).Equal(*sessions[0].EditableUntil))

	// A lesson on a later day has no session, so no deadline either.
	tomorrow := w.today.AddDate(0, 0, 7)
	sessions, err = svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &tomorrow, Viewer: &owner})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Nil(t, sessions[0].EditableUntil)
}
