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

// TestExitPermitReviewQueueLeavesOutPermitsPastTheirLessons covers the approver queue
// and its inbox badge once a permit's lessons are over, before the expiry
// job has closed it. The counselor's queue still listed such a permit
// waiting at their stage as "Berjalan" with "Tindak lanjuti", while the
// student's card read it as expired and their scan was refused; security's
// queue kept an approved permit the gate now refuses. Both queues and their
// counts now hold only the permits of the tenant's own day whose last
// period (Jam 2, ending 09:00) has not yet ended.
func TestExitPermitReviewQueueLeavesOutPermitsPastTheirLessons(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-queue-day-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	// A gate officer: holds scan_exit_permits through a role, so every
	// approved permit awaiting the gate is in their queue.
	var guardID, roleID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into users (tenant_id, username, password_hash, name, status, locale) values ($1, $2, 'x', 'Satpam Test', 'active', 'id') returning id`,
		w.tenantID, "guard-"+uuid.NewString()[:8],
	).Scan(&guardID))
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into roles (tenant_id, slug, name, is_system) values ($1, 'gate_guard', 'Satpam', true) returning id`, w.tenantID,
	).Scan(&roleID))
	_, err = pg.AdminPool.Exec(ctx, `insert into role_permissions (role_id, permission_code, tenant_id) values ($1, 'scan_exit_permits', $2)`, roleID, w.tenantID)
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, `insert into user_roles (user_id, role_id, tenant_id, is_primary) values ($1, $2, $3, true)`, guardID, roleID, w.tenantID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 1, 0)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}

	queueIDs := func(ctx context.Context, caller uuid.UUID) []uuid.UUID {
		t.Helper()
		queue, err := svc.ListExitPermitsForApproval(ctx, w.tenantID, caller)
		require.NoError(t, err)
		count, err := svc.CountExitPermitsForApproval(ctx, w.tenantID, caller)
		require.NoError(t, err)
		require.Equal(t, len(queue), count, "the inbox badge matches the queue")
		ids := make([]uuid.UUID, 0, len(queue))
		for _, item := range queue {
			ids = append(ids, item.InstanceID)
		}
		return ids
	}

	// Day 0: approved at the duty teacher's stage, then left waiting for
	// the counselor all day.
	pending, _, err := svc.CreateExitPermit(at(0, 7, 10), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	dutyToken, err := svc.IssueScanToken(at(0, 7, 15), service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: pending.ID, Valid: true}, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(at(0, 7, 15), w.tenantID, pending.ID, w.studentID, dutyToken.RawValue)
	require.NoError(t, err)

	// On its own day it waits for the counselor until its last period ends.
	require.Equal(t, []uuid.UUID{pending.ID}, queueIDs(at(0, 8, 59), w.counselorID))
	require.Empty(t, queueIDs(at(0, 9, 0), w.counselorID), "its lessons are over")

	// Day 1: yesterday's permit stays out of the counselor's queue even
	// before today's periods end; today's approved one waits for the gate
	// until its own lessons are over.
	approvedID, _ := runExitPermitToGate(t, at(1, 7, 10), svc, w)
	require.Empty(t, queueIDs(at(1, 7, 30), w.counselorID), "yesterday's permit can go no further")
	require.Equal(t, []uuid.UUID{approvedID}, queueIDs(at(1, 8, 59), guardID))
	require.Empty(t, queueIDs(at(1, 9, 0), guardID), "the gate refuses it once its lessons are over")

	// Day 2: the approved permit never taken through the gate stays out.
	require.Empty(t, queueIDs(at(2, 7, 30), guardID), "yesterday's approved permit is refused at the gate")
	require.Empty(t, queueIDs(at(2, 7, 30), w.counselorID))
}
