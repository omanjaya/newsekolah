package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// TestRequestPasswordResetEnforcesIPRateLimit proves service.Extras.ResetLimiter
// actually bounds RequestPasswordReset once it is set (cmd/api/wire.go now
// wires it with auth.NewIPRateLimiter -- previously it was left nil, so the
// per-IP budget docs/08-security.md section 2 promises never ran in
// production). Uses the same concrete auth.IPRateLimiter type wire.go
// constructs, not a fake, so this exercises the real Allow() semantics.
func TestRequestPasswordResetEnforcesIPRateLimit(t *testing.T) {
	pg, _, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "reset-ratelimit-test")
	insertTestUser(t, pg.AdminPool, tenantID, "resetuser")

	repo := repository.New(pg.AppPool)
	limiter := auth.NewIPRateLimiter(auth.NewMemoryStore(), "test:reset_password:ip", 2, time.Minute)
	svc := service.New(pg.AppPool, repo, nil, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{
		ResetLimiter: limiter,
	})

	const ip = "203.0.113.50"
	require.NoError(t, svc.RequestPasswordReset(ctx, tenantID, "resetuser", ip))
	require.NoError(t, svc.RequestPasswordReset(ctx, tenantID, "resetuser", ip))

	err := svc.RequestPasswordReset(ctx, tenantID, "resetuser", ip)
	require.ErrorIs(t, err, domain.ErrRateLimited, "a third request from the same IP within the window must be rejected")

	// A different IP is unaffected by the first IP's exhausted budget.
	require.NoError(t, svc.RequestPasswordReset(ctx, tenantID, "resetuser", "203.0.113.51"))
}

// TestRequestPasswordResetWithoutLimiterStillWorks proves ResetLimiter
// being unset (e.g. in a test/dev wiring that omits it) is a documented
// no-limit fallback, not a crash -- service.Extras is a struct of optional
// collaborators.
func TestRequestPasswordResetWithoutLimiterStillWorks(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "reset-nolimiter-test")
	insertTestUser(t, pg.AdminPool, tenantID, "resetuser")

	for i := 0; i < 5; i++ {
		require.NoError(t, svc.RequestPasswordReset(ctx, tenantID, "resetuser", "203.0.113.60"))
	}
}
