package permits

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// recordingDiscipline remembers every violation permits asked discipline
// to record.
type recordingDiscipline struct{ recorded []uuid.UUID }

func (r *recordingDiscipline) RecordLateArrivalViolation(_ context.Context, _, _, violationTypeID, _, _ uuid.UUID, _ string) error {
	r.recorded = append(r.recorded, violationTypeID)
	return nil
}

// flaggedLateArrivals builds a permits service that reads every module's
// flag from the real platform console, with discipline recorded into rec.
func flaggedLateArrivals(pool *pgxpool.Pool, rec *recordingDiscipline) (*service.Service, *platformservice.Service) {
	platformSvc := platform.Register(platform.Dependencies{Pool: pool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	mod := Register(Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}, Discipline: rec,
		Config:      service.DefaultConfig([]byte("a-test-signing-key"), "test-bucket"),
		Flags:       wiring.ModuleFlag{Flags: platformSvc, Module: platformdomain.ModulePermits},
		ModuleFlags: platformSvc,
	})
	return mod.Service, platformSvc
}

// openLateArrival has the world's student scan the duty teacher's QR.
func openLateArrival(t *testing.T, ctx context.Context, svc *service.Service, w realtimeWorld) service.LateArrivalDetail {
	t.Helper()
	issued, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeLateArrival, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	opened, err := svc.OpenLateArrival(ctx, service.OpenLateArrivalInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: issued.RawValue,
	})
	require.NoError(t, err)
	return opened
}

// TestLateArrivalStopsBlockingAttendanceWhilePermitsIsOff covers
// wiring.PermitsBlocker: an open late-arrival flow keeps the student out
// of the day's attendance saves, but nobody can finish the flow while
// permits is switched off, so the student is not blocked then; the flow is
// kept and blocks again once permits is back on.
func TestLateArrivalStopsBlockingAttendanceWhilePermitsIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc, platformSvc := flaggedLateArrivals(pg.AppPool, &recordingDiscipline{})
	blocker := wiring.PermitsBlocker{Svc: svc, Flags: platformSvc}

	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-block-"+uuid.NewString())
	opened := openLateArrival(t, ctx, svc, w)
	today := opened.Instance.LocalDate
	if today.IsZero() {
		today = opened.Instance.OpenedAt
	}

	blocked, reason, err := blocker.IsBlocked(ctx, w.tenantID, w.studentID, today)
	require.NoError(t, err)
	require.True(t, blocked, "permits on: the open flow blocks the attendance save")
	require.Equal(t, "late_arrival_in_progress", reason)

	_, err = platformSvc.SetFlag(ctx, w.tenantID, string(platformdomain.ModulePermits), false)
	require.NoError(t, err)
	blocked, reason, err = blocker.IsBlocked(ctx, w.tenantID, w.studentID, today)
	require.NoError(t, err)
	require.False(t, blocked, "permits off: the flow cannot be finished, so it must not block")
	require.Empty(t, reason)
	require.Equal(t, string(domain.StatusInProgress), instanceStatus(t, ctx, pg.AdminPool, opened.Instance.ID), "the flow itself is kept")

	_, err = platformSvc.SetFlag(ctx, w.tenantID, string(platformdomain.ModulePermits), true)
	require.NoError(t, err)
	blocked, _, err = blocker.IsBlocked(ctx, w.tenantID, w.studentID, today)
	require.NoError(t, err)
	require.True(t, blocked, "permits back on: it blocks again")
}

// TestLateArrivalReviewDropsViolationsWhileDisciplineIsOff reviews one late
// arrival per tenant with the same violation_ids selected: with discipline
// on they are recorded and kept on the flow's payload; with discipline off
// the review still succeeds but neither happens.
func TestLateArrivalReviewDropsViolationsWhileDisciplineIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	rec := &recordingDiscipline{}
	svc, platformSvc := flaggedLateArrivals(pg.AppPool, rec)

	review := func(w realtimeWorld, violationID uuid.UUID) service.LateArrivalDetail {
		t.Helper()
		opened := openLateArrival(t, ctx, svc, w)
		reviewed, err := svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{
			TenantID: w.tenantID, InstanceID: opened.Instance.ID, ReviewerUserID: w.dutyTeacherID,
			Reason: "Macet", ViolationIDs: []uuid.UUID{violationID},
		})
		require.NoError(t, err)
		return reviewed
	}

	on := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-viol-on-"+uuid.NewString())
	off := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-viol-off-"+uuid.NewString())
	_, err := platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModuleDiscipline), false)
	require.NoError(t, err)

	onViolation, offViolation := uuid.New(), uuid.New()
	onDetail := review(on, onViolation)
	require.Equal(t, []uuid.UUID{onViolation}, rec.recorded, "discipline on: the violation is recorded")
	require.Equal(t, []any{onViolation.String()}, onDetail.Instance.Payload["violation_ids"])

	offDetail := review(off, offViolation)
	require.Equal(t, []uuid.UUID{onViolation}, rec.recorded, "discipline off: nothing more is recorded")
	require.NotContains(t, offDetail.Instance.Payload, "violation_ids", "discipline off: nothing is kept on the payload")
	var stored []byte
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select payload from workflow_instances where id = $1`, offDetail.Instance.ID).Scan(&stored))
	require.NotContains(t, string(stored), "violation_ids")

	// The duty teacher's manual record at the gate follows the same rule.
	gate := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-viol-gate-"+uuid.NewString())
	_, err = platformSvc.SetFlag(ctx, gate.tenantID, string(platformdomain.ModuleDiscipline), false)
	require.NoError(t, err)
	recorded, err := svc.RecordLateArrivalByStaff(ctx, service.RecordLateArrivalByStaffInput{
		TenantID: gate.tenantID, StudentUserID: gate.studentID, Reason: "Ban bocor",
		ViolationIDs: []uuid.UUID{uuid.New()}, RecordedBy: gate.dutyTeacherID,
	})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{onViolation}, rec.recorded)
	require.NotContains(t, recorded.Instance.Payload, "violation_ids")
}
