package database

import "testing"

// TestRefuseIfPrivileged covers the production/non-production decision in
// EnsureLeastPrivilege without needing a live Postgres connection: a real
// role check against pg_roles is exercised separately by
// apps/api/cmd/api/integration_test.go's TestTenantIsolationRLS, which
// already requires a non-superuser role to prove RLS applies.
func TestRefuseIfPrivileged(t *testing.T) {
	cases := []struct {
		name       string
		privileged bool
		appEnv     string
		wantErr    bool
	}{
		{"privileged role in production is refused", true, "production", true},
		{"privileged role outside production is allowed", true, "development", false},
		{"privileged role with empty APP_ENV is allowed", true, "", false},
		{"unprivileged role in production is allowed", false, "production", false},
		{"unprivileged role outside production is allowed", false, "development", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := refuseIfPrivileged(tc.privileged, tc.appEnv)
			if tc.wantErr && err == nil {
				t.Fatalf("refuseIfPrivileged(%v, %q) = nil, want error", tc.privileged, tc.appEnv)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("refuseIfPrivileged(%v, %q) = %v, want nil", tc.privileged, tc.appEnv, err)
			}
		})
	}
}
