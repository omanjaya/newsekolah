package http

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// TestIsAdminCaller covers the role check ListAtRiskStudents/
// GetStudentRisk (handler.go) reuse from the admin dashboard to grant
// admin/super_admin/principal callers school-wide early-warning scope
// (service.resolveScope's isOverseer parameter): the bug this guards
// against is those three system roles getting turned away with
// ErrNotHomeroomTeacher/403 despite holding view_early_warning, because
// they hold neither a counseling/leadership duty nor a homeroom class.
func TestIsAdminCaller(t *testing.T) {
	cases := []struct {
		name  string
		roles []string
		want  bool
	}{
		{"admin", []string{authz.RoleSlugAdmin}, true},
		{"super_admin", []string{authz.RoleSlugSuperAdmin}, true},
		{"principal", []string{authz.RoleSlugPrincipal}, true},
		{"principal alongside an unrelated role", []string{"teacher", authz.RoleSlugPrincipal}, true},
		{"plain teacher", []string{"teacher"}, false},
		{"no roles at all", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := authz.WithIdentity(context.Background(), authz.Identity{Authenticated: true, Roles: tc.roles})
			require.Equal(t, tc.want, isAdminCaller(ctx))
		})
	}
}
