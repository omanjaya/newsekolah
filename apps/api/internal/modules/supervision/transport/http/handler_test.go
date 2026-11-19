package http

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// fakePerms returns a fixed permission set (or error) and records the
// tenant and user it was asked about.
type fakePerms struct {
	set              authz.Set
	err              error
	gotTenant, gotID uuid.UUID
}

func (f *fakePerms) EffectivePermissions(_ context.Context, tenantID, userID uuid.UUID) (authz.Set, error) {
	f.gotTenant, f.gotID = tenantID, userID
	return f.set, f.err
}

func TestReaderScope(t *testing.T) {
	keyOf := func(codes ...string) *authz.Set {
		set := authz.NewSet(codes...)
		return &set
	}
	errBoom := errors.New("permissions unavailable")

	cases := []struct {
		name    string
		perms   *fakePerms
		key     *authz.Set
		wantAll bool
		wantErr error
	}{
		{
			name:    "user with view_supervision and no key reads every teacher",
			perms:   &fakePerms{set: authz.NewSet(authz.PermViewSupervision)},
			wantAll: true,
		},
		{
			name:    "user with view_supervision and a key holding it reads every teacher",
			perms:   &fakePerms{set: authz.NewSet(authz.PermViewSupervision)},
			key:     keyOf(authz.PermViewSupervision),
			wantAll: true,
		},
		{
			name:  "a key granted only view_own_supervision limits the reader to own records",
			perms: &fakePerms{set: authz.NewSet(authz.PermViewSupervision, authz.PermViewOwnSupervision)},
			key:   keyOf(authz.PermViewOwnSupervision),
		},
		{
			name:  "a key holding view_supervision does not lift a user without it",
			perms: &fakePerms{set: authz.NewSet(authz.PermViewOwnSupervision)},
			key:   keyOf(authz.PermViewSupervision),
		},
		{
			name:  "user with only view_own_supervision reads own records",
			perms: &fakePerms{set: authz.NewSet(authz.PermViewOwnSupervision)},
		},
		{
			name:    "a permission lookup error fails closed",
			perms:   &fakePerms{err: errBoom},
			wantErr: errBoom,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tenantID, userID := uuid.New(), uuid.New()
			ctx := httpx.WithUserID(httpx.WithTenantID(context.Background(), tenantID), userID)
			ctx = authz.WithIdentity(ctx, authz.Identity{
				Authenticated: true, UserID: userID, TenantID: tenantID, KeyPermissions: tc.key,
			})

			reader, err := New(nil, tc.perms).reader(ctx)

			if tc.wantErr != nil {
				require.ErrorIs(t, err, tc.wantErr)
				require.Equal(t, uuid.Nil, reader.UserID)
				require.False(t, reader.AllTeachers)
				return
			}
			require.NoError(t, err)
			require.Equal(t, userID, reader.UserID)
			require.Equal(t, tc.wantAll, reader.AllTeachers)
			require.Equal(t, tenantID, tc.perms.gotTenant)
			require.Equal(t, userID, tc.perms.gotID)
		})
	}

	t.Run("no permission checker limits the reader to own records", func(t *testing.T) {
		userID := uuid.New()
		ctx := httpx.WithUserID(httpx.WithTenantID(context.Background(), uuid.New()), userID)

		reader, err := New(nil, nil).reader(ctx)

		require.NoError(t, err)
		require.Equal(t, userID, reader.UserID)
		require.False(t, reader.AllTeachers)
	})
}
