package service

import (
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// passwordResetTTL applies to both the self-service "forgot password" flow
// and an admin-initiated reset: docs/08-security.md section 2 fixes it at
// 30 minutes for both.
const passwordResetTTL = 30 * time.Minute

// impersonationSessionTTL is the fixed lifetime of an impersonation
// session (docs/08-security.md section 2).
const impersonationSessionTTL = 30 * time.Minute

// knownPermissionSet builds a lookup of every valid permission code, so a
// role's or duty type's permission replacement can reject an unknown code
// before it ever reaches the database (the FK on permission_code would
// also catch it, but with a much less specific error).
func knownPermissionSet() authz.Set {
	return authz.NewSet(authz.Codes()...)
}

// PasswordResetTTL is exported for the transport layer to report token lifetime.
const PasswordResetTTL = passwordResetTTL
