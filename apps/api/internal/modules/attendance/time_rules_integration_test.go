package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestSaveWindowFollowsTenantZoneAndBusinessClock: under a simulated
// clock in a UTC+8 school, the owner's save and the correction deadline
// close at the end of the seventh day on the school's wall clock (not
// eight hours later, audit S11); the session says when it locks
// (editable_until, audit S20/T18); and submitted_at is the simulated save
// time, not the database's real now() (audit S21).
func TestSaveWindowFollowsTenantZoneAndBusinessClock(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "tenant-zone-window")
	_, err := pg.AdminPool.Exec(ctx, "update tenants set timezone = 'Asia/Makassar' where id = $1", w.tenantID)
	require.NoError(t, err)
	svc := buildService(pg.AppPool)
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)

	y, m, d := w.yesterday.Date()
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(y, m, d+day, hour, minute, 0, 0, wita))
	}
	owner := service.Actor{UserID: w.teacherID}
	homeroom := service.Actor{UserID: w.teacherID}
	input := service.SaveEntriesInput{Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}}}

	savedAt := time.Date(y, m, d, 7, 5, 0, 0, wita)
	opened, err := svc.OpenSession(clock.WithTime(ctx, savedAt), w.tenantID, owner, w.scheduleYesterdayID, w.yesterday, domain.SaveModeNormal)
	require.NoError(t, err)
	deadline := time.Date(y, m, d+7, 23, 59, 59, 0, wita)
	require.NotNil(t, opened.EditableUntil)
	require.True(t, opened.EditableUntil.Equal(deadline), "the owner is told the save closes at the end of the seventh day, school time: %s", opened.EditableUntil)

	saved, err := svc.SaveEntries(clock.WithTime(ctx, savedAt), w.tenantID, owner, opened.Session.ID, input)
	require.NoError(t, err)
	require.NotNil(t, saved.Session.SubmittedAt)
	require.True(t, saved.Session.SubmittedAt.Equal(savedAt), "submitted_at is the simulated save time, got %s", saved.Session.SubmittedAt)
	require.NotNil(t, saved.EditableUntil)

	_, err = svc.SaveEntries(at(7, 23, 55), w.tenantID, owner, opened.Session.ID, input)
	require.NoError(t, err, "still open in the last minutes of the seventh day")

	_, err = svc.SaveEntries(at(8, 7, 55), w.tenantID, owner, opened.Session.ID, input)
	require.ErrorIs(t, err, domain.ErrSaveWindowClosed, "closed the next morning, school time")
	_, err = svc.SaveEntries(at(8, 7, 55), w.tenantID, homeroom, opened.Session.ID, service.SaveEntriesInput{
		Mode: domain.SaveModeCorrection, Reason: "salah input", Entries: input.Entries,
	})
	require.ErrorIs(t, err, domain.ErrCorrectionWindowClosed, "a correction closes at the same instant")

	reopened, err := svc.GetSessionDetail(at(8, 7, 55), w.tenantID, owner, opened.Session.ID)
	require.NoError(t, err)
	require.NotNil(t, reopened.EditableUntil)
	require.True(t, reopened.EditableUntil.Equal(deadline), "the editor can show the session as locked")

	corrector := service.Actor{UserID: w.otherTeacherID, CanViewAll: true}
	viewed, err := svc.GetSessionDetail(at(1, 9, 0), w.tenantID, corrector, opened.Session.ID)
	require.NoError(t, err)
	require.Equal(t, domain.SaveModeCorrection, viewed.SaveMode)
	require.Nil(t, viewed.EditableUntil, "a viewer who may not correct has no save window at all")
}
