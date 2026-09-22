package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// TestRequestPasswordResetInvalidatesPreviousToken proves a second
// forgot-password request supersedes the first: the earlier token must no
// longer confirm a reset once a newer one has been issued.
func TestRequestPasswordResetInvalidatesPreviousToken(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "reset-request-test")
	insertTestUser(t, pg.AdminPool, tenantID, "resetuser")

	var tokens []string
	recordingNewRefresh := func() (string, []byte, error) {
		token, hash, err := auth.NewRefreshToken()
		if err != nil {
			return "", nil, err
		}
		tokens = append(tokens, token)
		return token, hash, nil
	}
	repo := repository.New(pg.AppPool)
	svc = service.New(pg.AppPool, repo, nil, nil, nil, clock.Real{}, service.Config{}, recordingNewRefresh, service.Extras{})

	require.NoError(t, svc.RequestPasswordReset(ctx, tenantID, "resetuser", "127.0.0.1"))
	require.NoError(t, svc.RequestPasswordReset(ctx, tenantID, "resetuser", "127.0.0.1"))
	require.Len(t, tokens, 2)
	firstToken, secondToken := tokens[0], tokens[1]

	err := svc.ConfirmPasswordReset(ctx, tenantID, firstToken, "newpassword1")
	require.ErrorIs(t, err, domain.ErrPasswordResetTokenInvalid, "the superseded first token must no longer confirm")

	require.NoError(t, svc.ConfirmPasswordReset(ctx, tenantID, secondToken, "newpassword2"))
}

// TestConfirmPasswordResetInvalidatesOtherTokens proves a successful
// confirm invalidates every other unused reset token for the same
// account, not just the one that was consumed, and still revokes and
// invalidates the account's active sessions from the cache.
func TestConfirmPasswordResetInvalidatesOtherTokens(t *testing.T) {
	pg, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "reset-confirm-test")
	userID := insertTestUser(t, pg.AdminPool, tenantID, "confirmuser")
	sessionID := insertTestSession(t, pg.AdminPool, tenantID, userID, "login", uuid.NullUUID{})

	// Fixture seeding for the two reset tokens goes through AdminPool,
	// bypassing RLS the same way insertTestSession above does: these rows
	// stand in for what RequestPasswordReset would have created, seeded
	// directly so the test controls the token values.
	fixtureRepo := repository.New(pg.AdminPool)
	token1, hash1, err := auth.NewRefreshToken()
	require.NoError(t, err)
	token2, hash2, err := auth.NewRefreshToken()
	require.NoError(t, err)
	require.NoError(t, fixtureRepo.CreatePasswordResetRecord(ctx, service.NewPasswordReset{
		TenantID: tenantID, UserID: userID, TokenHash: hash1, Channel: "email", ExpiresAt: time.Now().Add(30 * time.Minute),
	}))
	require.NoError(t, fixtureRepo.CreatePasswordResetRecord(ctx, service.NewPasswordReset{
		TenantID: tenantID, UserID: userID, TokenHash: hash2, Channel: "email", ExpiresAt: time.Now().Add(30 * time.Minute),
	}))

	require.NoError(t, svc.ConfirmPasswordReset(ctx, tenantID, token1, "newpassword1"))

	err = svc.ConfirmPasswordReset(ctx, tenantID, token2, "newpassword2")
	require.ErrorIs(t, err, domain.ErrPasswordResetTokenInvalid, "a sibling token must be invalidated by the successful confirm")

	require.True(t, cache.has(sessionID), "ConfirmPasswordReset must invalidate the account's active sessions from the cache")
}
