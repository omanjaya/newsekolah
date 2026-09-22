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
	pool, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pool, "reset-request-test")
	insertTestUser(t, pool, tenantID, "resetuser")

	var tokens []string
	recordingNewRefresh := func() (string, []byte, error) {
		token, hash, err := auth.NewRefreshToken()
		if err != nil {
			return "", nil, err
		}
		tokens = append(tokens, token)
		return token, hash, nil
	}
	repo := repository.New(pool)
	svc = service.New(pool, repo, nil, nil, nil, clock.Real{}, service.Config{}, recordingNewRefresh, service.Extras{})

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
	pool, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pool, "reset-confirm-test")
	userID := insertTestUser(t, pool, tenantID, "confirmuser")
	sessionID := insertTestSession(t, pool, tenantID, userID, "login", uuid.NullUUID{})

	repo := repository.New(pool)
	token1, hash1, err := auth.NewRefreshToken()
	require.NoError(t, err)
	token2, hash2, err := auth.NewRefreshToken()
	require.NoError(t, err)
	require.NoError(t, repo.CreatePasswordResetRecord(ctx, service.NewPasswordReset{
		TenantID: tenantID, UserID: userID, TokenHash: hash1, Channel: "email", ExpiresAt: time.Now().Add(30 * time.Minute),
	}))
	require.NoError(t, repo.CreatePasswordResetRecord(ctx, service.NewPasswordReset{
		TenantID: tenantID, UserID: userID, TokenHash: hash2, Channel: "email", ExpiresAt: time.Now().Add(30 * time.Minute),
	}))

	require.NoError(t, svc.ConfirmPasswordReset(ctx, tenantID, token1, "newpassword1"))

	err = svc.ConfirmPasswordReset(ctx, tenantID, token2, "newpassword2")
	require.ErrorIs(t, err, domain.ErrPasswordResetTokenInvalid, "a sibling token must be invalidated by the successful confirm")

	require.True(t, cache.has(sessionID), "ConfirmPasswordReset must invalidate the account's active sessions from the cache")
}
