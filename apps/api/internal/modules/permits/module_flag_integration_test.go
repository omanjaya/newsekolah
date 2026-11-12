package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	inboxservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/inbox/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// flaggedPermits builds a permits service whose background jobs read the
// real platform feature flags, plus the platform service that toggles them.
func flaggedPermits(pool *pgxpool.Pool) (*service.Service, *platformservice.Service) {
	platformSvc := platform.Register(platform.Dependencies{Pool: pool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	mod := Register(Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: service.Config{DocumentSigningKey: []byte("a-test-signing-key"), EvidenceMaxBytes: 6 << 20},
		Flags:  wiring.ModuleFlag{Flags: platformSvc, Module: platformdomain.ModulePermits},
	})
	return mod.Service, platformSvc
}

// submitLeave opens one in-progress leave request for the world's student
// at simulated time day.
func submitLeave(t *testing.T, ctx context.Context, svc *service.Service, w leaveWorld) uuid.UUID {
	t.Helper()
	submitted, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: clock.Now(ctx, clock.Real{}), EndsOn: clock.Now(ctx, clock.Real{}).AddDate(0, 0, 1),
	})
	require.NoError(t, err)
	return submitted.Instance.ID
}

func instanceStatus(t *testing.T, ctx context.Context, admin *pgxpool.Pool, id uuid.UUID) string {
	t.Helper()
	var status string
	require.NoError(t, admin.QueryRow(ctx, `select status from workflow_instances where id = $1`, id).Scan(&status))
	return status
}

// TestExpireHangingInstancesSkipsTenantsWithPermitsOff runs the hanging-flow
// expiry job over two tenants whose flows were both opened days ago: the
// tenant with permits turned off keeps its flow in progress, the other
// tenant's flow is expired in the same run.
func TestExpireHangingInstancesSkipsTenantsWithPermitsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc, platformSvc := flaggedPermits(pg.AppPool)

	real := time.Now()
	day := clock.WithTime(ctx, time.Date(real.Year()+1, real.Month(), real.Day(), 8, 0, 0, 0, time.UTC))
	on := seedLeaveWorld(t, ctx, pg.AdminPool, "expire-on-"+uuid.NewString())
	off := seedLeaveWorld(t, ctx, pg.AdminPool, "expire-off-"+uuid.NewString())
	onID := submitLeave(t, day, svc, on)
	offID := submitLeave(t, day, svc, off)
	_, err := pg.AdminPool.Exec(ctx, `update workflow_instances set opened_at = now() - interval '3 days' where id = any($1)`,
		[]uuid.UUID{onID, offID})
	require.NoError(t, err)

	_, err = platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModulePermits), false)
	require.NoError(t, err)

	expired, err := svc.ExpireHangingInstances(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, expired)
	require.Equal(t, "expired", instanceStatus(t, ctx, pg.AdminPool, onID))
	require.Equal(t, "in_progress", instanceStatus(t, ctx, pg.AdminPool, offID), "a tenant with permits off is left untouched")

	// Turning permits back on lets the next run catch up.
	_, err = platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModulePermits), true)
	require.NoError(t, err)
	expired, err = svc.ExpireHangingInstances(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, expired)
	require.Equal(t, "expired", instanceStatus(t, ctx, pg.AdminPool, offID))
}

// grantAll is an inbox PermissionReader granting the leave-review queue.
type grantLeaveReview struct{}

func (grantLeaveReview) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return authz.NewSet(authz.PermReviewLeaveRequests), nil
}

// noWarningLetters is never reached: the caller lacks issue_warning_letters.
type noWarningLetters struct{}

func (noWarningLetters) CountDueSPCandidates(context.Context, uuid.UUID) (int, error) { return 0, nil }

// TestInboxCountsZeroForPermitsQueuesWhenPermitsOff covers the always-on
// action inbox reading a toggleable module: with permits turned off the
// pending leave request still exists but the badge counts 0 without an
// error, while another tenant's identical request is still counted.
func TestInboxCountsZeroForPermitsQueuesWhenPermitsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc, platformSvc := flaggedPermits(pg.AppPool)

	real := time.Now()
	day := clock.WithTime(ctx, time.Date(real.Year()+1, real.Month(), real.Day(), 8, 0, 0, 0, time.UTC))
	on := seedLeaveWorld(t, ctx, pg.AdminPool, "inbox-on-"+uuid.NewString())
	off := seedLeaveWorld(t, ctx, pg.AdminPool, "inbox-off-"+uuid.NewString())
	submitLeave(t, day, svc, on)
	offID := submitLeave(t, day, svc, off)

	_, err := platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModulePermits), false)
	require.NoError(t, err)

	queues := wiring.InboxPermits{Queues: svc, Flags: platformSvc}
	inbox := inboxservice.New(grantLeaveReview{}, queues, queues, queues, noWarningLetters{})

	onCounts, err := inbox.Counts(day, inboxservice.Caller{TenantID: on.tenantID, UserID: on.homeroomTeacherID})
	require.NoError(t, err)
	require.Equal(t, 1, onCounts.Leave)

	offCounts, err := inbox.Counts(day, inboxservice.Caller{TenantID: off.tenantID, UserID: off.homeroomTeacherID})
	require.NoError(t, err)
	require.Equal(t, inboxservice.Counts{}, offCounts)
	require.Equal(t, "in_progress", instanceStatus(t, ctx, pg.AdminPool, offID), "the request itself is untouched")
}
