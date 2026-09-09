package domain

import (
	"time"

	"github.com/google/uuid"
)

type ClientKind string

const (
	ClientWeb     ClientKind = "web"
	ClientIOS     ClientKind = "ios"
	ClientAndroid ClientKind = "android"
)

// Session mirrors the fields of a sessions row needed to decide what a
// refresh request should do. It exists so RefreshOutcome is testable
// without a database.
type Session struct {
	ID        uuid.UUID
	FamilyID  uuid.UUID
	UserID    uuid.UUID
	TenantID  uuid.UUID
	Client    ClientKind
	RevokedAt *time.Time
	ExpiresAt time.Time
}

type RefreshOutcome int

const (
	// RefreshRotate: the presented token is the current one for its
	// session; issue a new session row in the same family and revoke this
	// one with reason "rotated".
	RefreshRotate RefreshOutcome = iota
	// RefreshReuseDetected: the presented token belongs to a session that
	// was already revoked (most likely by an earlier rotation), meaning
	// this token has been used more than once. Per
	// docs/08-security.md section 2, this revokes the entire session
	// family -- treat it as a stolen refresh token.
	RefreshReuseDetected
	// RefreshExpired: the token is still the current one for its session
	// but the session's absolute expiry has passed.
	RefreshExpired
)

// EvaluateRefresh is the single place that decides what a refresh attempt
// means, given the session row the presented token's hash matched.
func EvaluateRefresh(s Session, now time.Time) RefreshOutcome {
	if s.RevokedAt != nil {
		return RefreshReuseDetected
	}
	if now.After(s.ExpiresAt) {
		return RefreshExpired
	}
	return RefreshRotate
}
