package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestExitPermitLeftOpenOnAnEarlierDayReadsAsExpired covers a permit left
// at the duty teacher's stage and one approved but never taken through the
// gate. On a later school day (here a simulated one, which the real-clock
// expiry job never sees) the student's list and the permit's own detail
// still said "Berjalan, menunggu Guru piket" and "Disetujui", although
// neither could go on. Every read now reports both as expired on the
// tenant's business day, while the same day still reads them as they are.
func TestExitPermitLeftOpenOnAnEarlierDayReadsAsExpired(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-read-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 1, 0)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}

	// Day 0: a request that waits at the duty teacher's stage all day.
	pending, _, err := svc.CreateExitPermit(at(0, 7, 10), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	// Day 1: one approved but never taken through the gate.
	approvedID, _ := runExitPermitToGate(t, at(1, 7, 10), svc, w)

	statuses := func(ctx context.Context) map[uuid.UUID]domain.Status {
		items, err := svc.ListMyExitPermits(ctx, w.tenantID, w.studentID, 50, 0)
		require.NoError(t, err)
		out := map[uuid.UUID]domain.Status{}
		for _, it := range items {
			out[it.Instance.ID] = it.Instance.Status
		}
		return out
	}
	detail := func(ctx context.Context, id uuid.UUID) domain.Status {
		out, err := svc.GetExitPermit(ctx, w.tenantID, id)
		require.NoError(t, err)
		return out.Instance.Status
	}

	// Late on its own day a permit still reads as it is: the web card
	// says its lessons are over, the expiry job closes it after midnight.
	require.Equal(t, domain.StatusInProgress, detail(at(0, 23, 30), pending.ID))
	require.Equal(t, domain.StatusApproved, detail(at(1, 23, 30), approvedID))
	require.Equal(t, domain.StatusApproved, statuses(at(1, 23, 30))[approvedID])

	// Day 2: both read as expired everywhere the student looks.
	day2 := at(2, 10, 30)
	list := statuses(day2)
	require.Equal(t, domain.StatusExpired, list[pending.ID], "the pending permit of an earlier day is over")
	require.Equal(t, domain.StatusExpired, list[approvedID], "the approved permit never taken through the gate is over")
	require.Equal(t, domain.StatusExpired, detail(day2, pending.ID))
	require.Equal(t, domain.StatusExpired, detail(day2, approvedID))

	rows, err := svc.ExitPermitYearlyReportRows(day2, w.tenantID)
	require.NoError(t, err)
	reported := map[uuid.UUID]domain.Status{}
	for _, row := range rows {
		reported[row.InstanceID] = row.Status
	}
	require.Equal(t, domain.StatusExpired, reported[pending.ID])
	require.Equal(t, domain.StatusExpired, reported[approvedID])

	// The stored status is untouched: only the expiry job writes it.
	var stored string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from workflow_instances where id = $1`, pending.ID).Scan(&stored))
	require.Equal(t, string(domain.StatusInProgress), stored)
}
