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

// TestForceStatusPermitKeepsLeave is the regression test for an exit
// permit's gate scan replacing an issued leave letter's attendance (S
// from the letter became D from the permit). A permit must still
// override what a teacher recorded.
func TestForceStatusPermitKeepsLeave(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "force-permit-leave")

	opened, err := svc.OpenSession(ctx, w.tenantID, service.Actor{UserID: w.teacherID}, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, service.Actor{UserID: w.teacherID}, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student2ID, StatusCode: "H"}},
	})
	require.NoError(t, err)

	dayStart := w.today
	dayEnd := w.today.Add(24*time.Hour - time.Second)
	require.NoError(t, svc.ForceStatus(ctx, w.tenantID, w.student1ID, dayStart, dayEnd, "S", "leave", "leave letter 1/IZIN"))

	for _, student := range []uuid.UUID{w.student1ID, w.student2ID} {
		require.NoError(t, svc.ForceStatus(ctx, w.tenantID, student, dayStart, dayEnd, "D", "permit", "exit permit"))
	}

	entry := func(student uuid.UUID) (status, source string) {
		t.Helper()
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`select status_code, source from attendance_entries where session_id = $1 and student_user_id = $2`,
			opened.Session.ID, student,
		).Scan(&status, &source))
		return status, source
	}

	status, source := entry(w.student1ID)
	require.Equal(t, "S", status, "the leave letter's status must survive the exit permit")
	require.Equal(t, "leave", source)

	status, source = entry(w.student2ID)
	require.Equal(t, "D", status, "a permit still overrides the teacher's entry")
	require.Equal(t, "permit", source)
}
