package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type digestContacts struct{}

func (digestContacts) EmailForUser(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return "wali@example.test", true, nil
}

func (digestContacts) PhoneNumberForUser(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return "", false, nil
}

// TestComputeDueDigests_SkipsUserAlreadySentThisHour: the digest job runs
// on the hour and again on every worker start. A restart inside a user's
// digest hour must not send a second digest for a notification that
// arrived after the first one.
func TestComputeDueDigests_SkipsUserAlreadySentThisHour(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	var tenantID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		 values ($1,'Digest School','sma','Asia/Makassar','id','active','default') returning id`,
		"digest-"+uuid.NewString()[:8]).Scan(&tenantID))
	userID := uuid.New()
	// 08:00 in Asia/Makassar (UTC+8) is 00:00Z.
	_, err := pg.AdminPool.Exec(ctx,
		`insert into notification_settings (user_id, tenant_id, digest_enabled, digest_hour) values ($1, $2, true, 8)`,
		userID, tenantID)
	require.NoError(t, err)
	insertNotification := func(at time.Time) {
		t.Helper()
		_, err := pg.AdminPool.Exec(ctx,
			`insert into notifications (tenant_id, user_id, kind, title, body, created_at) values ($1, $2, 'test', 'Pengumuman', 'Isi', $3)`,
			tenantID, userID, at)
		require.NoError(t, err)
	}
	ownBatches := func(at time.Time) []service.DigestBatch {
		t.Helper()
		svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: at}, digestContacts{})
		batches, err := svc.ComputeDueDigests(ctx)
		require.NoError(t, err)
		var own []service.DigestBatch
		for _, b := range batches {
			if b.TenantID == tenantID {
				own = append(own, b)
			}
		}
		return own
	}

	first := time.Date(2026, 11, 20, 0, 5, 0, 0, time.UTC)
	insertNotification(first.Add(-time.Hour))
	require.Len(t, ownBatches(first), 1)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: first}, digestContacts{})
	require.NoError(t, svc.MarkDigestSent(ctx, tenantID, userID))

	// A notification arrives, then the worker restarts in the same hour.
	insertNotification(first.Add(10 * time.Minute))
	require.Empty(t, ownBatches(first.Add(30*time.Minute)))

	// The next day's digest hour picks it up.
	require.Len(t, ownBatches(first.Add(24*time.Hour)), 1)
}
