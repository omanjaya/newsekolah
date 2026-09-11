package domain

// AuthSettings is a tenant's session policy: how long a refresh token
// lives, and whether logging in on a new device revokes every other
// session (docs/analysis/backend-inventory.md section 1.1 -- restores
// the old app's auth.session_days/auth.single_device settings, dropped
// in the rewrite).
type AuthSettings struct {
	SessionDays  int
	SingleDevice bool
}

const (
	// DefaultSessionDays matches the old app's default (main.go).
	DefaultSessionDays = 30
	MinSessionDays     = 1
	MaxSessionDays     = 365
)

// ValidateAuthSettings enforces the 1-365 day bound.
func ValidateAuthSettings(in AuthSettings) error {
	if in.SessionDays < MinSessionDays || in.SessionDays > MaxSessionDays {
		return ErrInvalidSessionDays
	}
	return nil
}
