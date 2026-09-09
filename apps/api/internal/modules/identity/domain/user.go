// Package domain holds identity's entities and business rules: users,
// roles, duties, and sessions. It imports nothing but the standard library
// and platform/clock, so it is testable without a database or HTTP server.
package domain

import (
	"time"

	"github.com/google/uuid"
)

type UserStatus string

const (
	UserActive   UserStatus = "active"
	UserInactive UserStatus = "inactive"
	UserInvited  UserStatus = "invited"
)

type User struct {
	ID                 uuid.UUID
	TenantID           uuid.UUID
	Username           string
	Email              string
	Name               string
	PasswordHash       string
	Status             UserStatus
	MustChangePassword bool
	Locale             string
	AvatarURL          string
}

// CanAuthenticate reports whether a user in this status is allowed to log
// in at all (an invited user must first set a password through the
// out-of-band bootstrap flow, not the password login endpoint).
func (u User) CanAuthenticate() bool {
	return u.Status == UserActive
}

type Role struct {
	ID        uuid.UUID
	Slug      string
	Name      string
	IsPrimary bool
}

// PasswordPolicy validates a new password against docs/08-security.md
// section 2: Argon2id storage aside, the plaintext must clear a minimum
// length before it is ever hashed.
func ValidatePasswordPolicy(password string) error {
	if len(password) < 8 {
		return ErrPasswordTooShort
	}
	if len(password) > 128 {
		return ErrPasswordTooLong
	}
	return nil
}

// SessionExpiry computes the absolute expiry for a new refresh token.
func SessionExpiry(now time.Time, ttl time.Duration) time.Time {
	return now.Add(ttl)
}
