package domain

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSlugify(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"simple", "Budi Santoso", "budi.santoso"},
		{"extra punctuation", "O'Brien, Jr.", "o.brien.jr"},
		{"long name truncates to 24 chars", "Muhammad Abdurrahman Wahid Firdaus", "muhammad.abdurrahman.wah"},
		{"empty", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, Slugify(tt.in))
		})
	}
}

func TestGenerateUsername(t *testing.T) {
	t.Run("free base is used as-is", func(t *testing.T) {
		got, err := GenerateUsername("Budi Santoso", func(string) bool { return false })
		require.NoError(t, err)
		require.Equal(t, "budi.santoso", got)
	})

	t.Run("collision appends a numeric suffix", func(t *testing.T) {
		taken := map[string]bool{"budi.santoso": true, "budi.santoso2": true}
		got, err := GenerateUsername("Budi Santoso", func(c string) bool { return taken[c] })
		require.NoError(t, err)
		require.Equal(t, "budi.santoso3", got)
	})

	t.Run("blank name still produces a candidate", func(t *testing.T) {
		got, err := GenerateUsername("", func(string) bool { return false })
		require.NoError(t, err)
		require.Equal(t, "user", got)
	})

	t.Run("gives up after too many collisions", func(t *testing.T) {
		_, err := GenerateUsername("Budi", func(string) bool { return true })
		require.Error(t, err)
	})
}

func TestValidateRoleGrants(t *testing.T) {
	adminID := uuid.New()

	tests := []struct {
		name         string
		actorIsSuper bool
		grants       []RoleGrant
		wantErr      error
	}{
		{
			name:         "single primary role, non-super grant, ok",
			actorIsSuper: false,
			grants:       []RoleGrant{{RoleID: adminID, Slug: "teacher", IsPrimary: true, IsSystem: true}},
			wantErr:      nil,
		},
		{
			name:         "primary plus a custom additional role, ok",
			actorIsSuper: false,
			grants: []RoleGrant{
				{Slug: "teacher", IsPrimary: true, IsSystem: true},
				{Slug: "wali-kelas-7a", IsPrimary: false, IsSystem: false},
			},
			wantErr: nil,
		},
		{
			name:         "no roles is rejected",
			actorIsSuper: true,
			grants:       nil,
			wantErr:      ErrNoPrimaryRole,
		},
		{
			name:         "two primaries is rejected",
			actorIsSuper: true,
			grants: []RoleGrant{
				{Slug: "teacher", IsPrimary: true, IsSystem: true},
				{Slug: "staff", IsPrimary: true, IsSystem: true},
			},
			wantErr: ErrNoPrimaryRole,
		},
		{
			name:         "zero primaries is rejected",
			actorIsSuper: true,
			grants:       []RoleGrant{{Slug: "teacher", IsPrimary: false}},
			wantErr:      ErrNoPrimaryRole,
		},
		{
			name:         "granting super_admin without being super_admin is rejected",
			actorIsSuper: false,
			grants:       []RoleGrant{{Slug: SuperAdminRoleSlug, IsPrimary: true, IsSystem: true}},
			wantErr:      ErrOnlySuperAdminGrants,
		},
		{
			name:         "a super_admin can grant super_admin",
			actorIsSuper: true,
			grants:       []RoleGrant{{Slug: SuperAdminRoleSlug, IsPrimary: true, IsSystem: true}},
			wantErr:      nil,
		},
		{
			name:         "a custom primary role is rejected",
			actorIsSuper: true,
			grants:       []RoleGrant{{Slug: "wali-kelas-7a", IsPrimary: true, IsSystem: false}},
			wantErr:      ErrPrimaryRoleNotSystem,
		},
		{
			name:         "a system role as an additional grant is rejected",
			actorIsSuper: true,
			grants: []RoleGrant{
				{Slug: "teacher", IsPrimary: true, IsSystem: true},
				{Slug: "staff", IsPrimary: false, IsSystem: true},
			},
			wantErr: ErrAdditionalRoleSystem,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRoleGrants(tt.actorIsSuper, tt.grants)
			if tt.wantErr == nil {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, tt.wantErr)
			}
		})
	}
}

func TestValidateArchiveTarget(t *testing.T) {
	self := uuid.New()
	other := uuid.New()

	require.ErrorIs(t, ValidateArchiveTarget(self, self), ErrCannotArchiveSelf)
	require.NoError(t, ValidateArchiveTarget(self, other))
}
