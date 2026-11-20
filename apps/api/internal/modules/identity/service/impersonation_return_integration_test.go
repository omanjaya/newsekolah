package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// newImpersonationFixture is the role-testing fixture with a school admin
// as the actor: impersonate_users instead of platform_superadmin.
func newImpersonationFixture(t *testing.T) roleTestingFixture {
	t.Helper()
	f := newRoleTestingFixture(t)
	_, err := f.pool.Exec(context.Background(),
		`update role_permissions set permission_code = 'impersonate_users' where tenant_id = $1 and permission_code = 'platform_superadmin'`,
		f.tenantID)
	require.NoError(t, err)
	return f
}

// A reload while impersonating used to sign the admin out: the
// impersonation session could never refresh, and starting it had replaced
// the admin's own refresh cookie, so stopping it ended on the sign-in page
// too. Started from the admin's web login, the impersonation now refreshes
// (as the impersonated account, still marked as the admin acting) up to its
// fixed end, and stopping it hands the admin's own session back.
func TestImpersonationWithReturnRefreshesAndRestoresTheAdmin(t *testing.T) {
	f := newImpersonationFixture(t)
	ctx := context.Background()

	started, err := f.svc.StartImpersonationWithReturn(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "", "test")
	require.NoError(t, err)
	require.Equal(t, f.firstID, started.Auth.Me.UserID)
	require.NotNil(t, started.Auth.Me.ImpersonatedBy)
	require.Equal(t, f.actorID, started.Auth.Me.ImpersonatedBy.UserID)
	require.NotNil(t, sessionRevokedAt(t, f.pool, f.rootID), "the admin's old bearer is retired")
	require.LessOrEqual(t, started.Deadline.Sub(f.clock.Now()), 30*time.Minute)

	proof, err := f.svc.DecodeRoleTestingProof(started.Proof)
	require.NoError(t, err)
	require.True(t, proof.Impersonation)

	// The reload: the page's refresh renews the impersonation, past the
	// access token's own 15 minutes.
	f.clock.at = f.clock.at.Add(20 * time.Minute)
	refreshed, err := f.svc.RefreshRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken)
	require.NoError(t, err)
	require.Equal(t, f.firstID, refreshed.Me.UserID)
	require.NotNil(t, refreshed.Me.ImpersonatedBy, "the banner survives the reload")
	require.Equal(t, started.Auth.SessionID, refreshed.SessionID)

	// It is not role testing: no role-testing controls, no switching.
	state, err := f.svc.RoleTestingState(ctx, f.tenantID, f.firstID, started.Auth.SessionID,
		uuid.NullUUID{UUID: f.actorID, Valid: true}, started.Proof, started.Auth.RefreshToken, "", "", uuid.Nil)
	require.NoError(t, err)
	require.False(t, state.Active)
	_, err = f.svc.SwitchRoleTesting(ctx, f.tenantID, started.Auth.SessionID, f.secondID, started.Proof, started.Auth.RefreshToken, "teacher", "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)

	// Hentikan: the admin is back in their own session.
	admin, err := f.svc.RestoreRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken, "", "test")
	require.NoError(t, err)
	require.Equal(t, f.actorID, admin.Me.UserID)
	require.Nil(t, admin.Me.ImpersonatedBy)
	require.NotEmpty(t, admin.RefreshToken)
	require.NotNil(t, sessionRevokedAt(t, f.pool, started.Auth.SessionID))
	_, err = f.svc.RefreshRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken)
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
}

// The impersonation still ends at its fixed 30 minutes: past it, neither a
// refresh nor a return works, and the admin signs in again.
func TestImpersonationWithReturnEndsAtItsFixedEnd(t *testing.T) {
	f := newImpersonationFixture(t)
	ctx := context.Background()

	started, err := f.svc.StartImpersonationWithReturn(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "", "test")
	require.NoError(t, err)

	f.clock.at = started.Deadline.Add(time.Second)
	_, err = f.svc.RefreshRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken)
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
	_, err = f.svc.RestoreRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
}

// An admin who lost the impersonate permission mid-way cannot keep the
// impersonation going; a wrong refresh cookie never parks anything.
func TestImpersonationWithReturnNeedsThePermissionAndTheAdminsOwnLogin(t *testing.T) {
	f := newImpersonationFixture(t)
	ctx := context.Background()

	_, err := f.svc.StartImpersonationWithReturn(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, "not-the-admins-cookie", "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
	require.Nil(t, sessionRevokedAt(t, f.pool, f.rootID))

	started, err := f.svc.StartImpersonationWithReturn(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "", "test")
	require.NoError(t, err)
	_, err = f.pool.Exec(ctx, `delete from role_permissions where tenant_id = $1 and permission_code = 'impersonate_users'`, f.tenantID)
	require.NoError(t, err)
	_, err = f.svc.RefreshRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken)
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
}
