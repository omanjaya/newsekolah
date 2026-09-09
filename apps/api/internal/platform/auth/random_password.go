package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

// NewRandomPassword returns a 256-bit random password, URL-safe
// base64-encoded (43 characters, well within the 8-128 character policy).
// It backs two flows that must never expose a chosen or reusable
// plaintext: creating a user without an explicit password (the admin then
// uses reset-password to hand them a real one) and any other place that
// needs an unguessable placeholder credential.
func NewRandomPassword() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate random password: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
