// Package auth provides password hashing, JWT issuance/verification, and
// refresh-token session management shared by the identity module.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters per docs/08-security.md section 2.
const (
	argonMemoryKiB  = 64 * 1024
	argonIterations = 3
	argonParallel   = 2
	argonSaltLen    = 16
	argonKeyLen     = 32
)

var ErrPasswordMismatch = errors.New("password does not match hash")

// HashPassword returns an encoded Argon2id hash in the standard
// `$argon2id$v=19$m=...,t=...,p=...$salt$hash` format.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argonIterations, argonMemoryKiB, argonParallel, argonKeyLen)

	encoded := fmt.Sprintf(
		"$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemoryKiB, argonIterations, argonParallel,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)
	return encoded, nil
}

// VerifyPassword checks password against an encoded hash produced by
// HashPassword, in constant time.
func VerifyPassword(encoded, password string) error {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return ErrPasswordMismatch
	}

	var memory, iterations uint32
	var parallel uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallel); err != nil {
		return ErrPasswordMismatch
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return ErrPasswordMismatch
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return ErrPasswordMismatch
	}
	if len(want) == 0 || len(want) > argonKeyLen {
		return ErrPasswordMismatch
	}

	got := argon2.IDKey([]byte(password), salt, iterations, memory, parallel, uint32(len(want))) //nolint:gosec // bounded above by argonKeyLen (32)
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return ErrPasswordMismatch
	}
	return nil
}

// dummyHash is a valid Argon2id hash of a random, unknown password. Login
// runs VerifyPassword against it for unknown usernames so the response time
// is indistinguishable from a real, failed password check.
var dummyHash = mustHash("not-a-real-password-just-for-timing")

func mustHash(password string) string {
	h, err := HashPassword(password)
	if err != nil {
		panic(err)
	}
	return h
}

// VerifyAgainstDummy runs the same Argon2id work as a real verification,
// for constant-time behavior when a username is not found.
func VerifyAgainstDummy(password string) {
	_ = VerifyPassword(dummyHash, password)
}
