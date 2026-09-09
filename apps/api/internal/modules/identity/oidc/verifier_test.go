package oidc

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testAudience = "test-client-id.apps.googleusercontent.com"
	testKid      = "test-key-1"
)

// fakeKeySource is a KeySource backed by an in-memory map, so verification
// tests never touch the network or Google's real keys.
type fakeKeySource map[string]*rsa.PublicKey

func (f fakeKeySource) Key(_ context.Context, kid string) (*rsa.PublicKey, error) {
	key, ok := f[kid]
	if !ok {
		return nil, jwt.ErrTokenUnverifiable
	}
	return key, nil
}

// issueTestToken signs a token with mutate applied to a set of otherwise
// valid claims, returning the raw JWT and the key source that can verify
// it.
func issueTestToken(t *testing.T, mutate func(*idTokenClaims)) (string, KeySource) {
	t.Helper()

	private, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	claims := idTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "https://accounts.google.com",
			Subject:   "108234567890123456789",
			Audience:  jwt.ClaimStrings{testAudience},
			ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
		Email:         "budi.guru@sekolah.sch.id",
		EmailVerified: true,
		HostedDomain:  "sekolah.sch.id",
		Name:          "Budi Guru",
	}
	if mutate != nil {
		mutate(&claims)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = testKid
	raw, err := token.SignedString(private)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	return raw, fakeKeySource{testKid: &private.PublicKey}
}

func TestVerifyIDToken_Accepts(t *testing.T) {
	raw, keys := issueTestToken(t, nil)
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	claims, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if err != nil {
		t.Fatalf("VerifyIDToken() error = %v, want nil", err)
	}
	if claims.Email != "budi.guru@sekolah.sch.id" {
		t.Errorf("Email = %q", claims.Email)
	}
	if !claims.EmailVerified {
		t.Errorf("EmailVerified = false, want true")
	}
	if claims.Subject != "108234567890123456789" {
		t.Errorf("Subject = %q", claims.Subject)
	}
}

func TestVerifyIDToken_HostedDomainNotEnforcedWhenConfigEmpty(t *testing.T) {
	raw, keys := issueTestToken(t, func(c *idTokenClaims) { c.HostedDomain = "other-domain.sch.id" })
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	if _, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "", now); err != nil {
		t.Fatalf("VerifyIDToken() error = %v, want nil", err)
	}
}

func TestVerifyIDToken_RejectsWrongHostedDomain(t *testing.T) {
	raw, keys := issueTestToken(t, func(c *idTokenClaims) { c.HostedDomain = "other-domain.sch.id" })
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if err == nil {
		t.Fatal("VerifyIDToken() error = nil, want ErrHostedDomainMismatch")
	}
	if !errors.Is(err, ErrHostedDomainMismatch) {
		t.Errorf("error = %v, want ErrHostedDomainMismatch", err)
	}
}

func TestVerifyIDToken_RejectsMissingHostedDomain(t *testing.T) {
	raw, keys := issueTestToken(t, func(c *idTokenClaims) { c.HostedDomain = "" })
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if !errors.Is(err, ErrHostedDomainMismatch) {
		t.Errorf("error = %v, want ErrHostedDomainMismatch", err)
	}
}

func TestVerifyIDToken_RejectsWrongAudience(t *testing.T) {
	raw, keys := issueTestToken(t, func(c *idTokenClaims) {
		c.Audience = jwt.ClaimStrings{"someone-elses-client-id.apps.googleusercontent.com"}
	})
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("error = %v, want ErrTokenInvalid", err)
	}
}

func TestVerifyIDToken_RejectsWrongIssuer(t *testing.T) {
	raw, keys := issueTestToken(t, func(c *idTokenClaims) { c.Issuer = "https://evil.example.com" })
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("error = %v, want ErrTokenInvalid", err)
	}
}

func TestVerifyIDToken_RejectsExpiredToken(t *testing.T) {
	raw, keys := issueTestToken(t, nil)
	// Well after the 1-hour expiry issueTestToken sets.
	now := time.Date(2026, 1, 1, 15, 0, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("error = %v, want ErrTokenInvalid", err)
	}
}

func TestVerifyIDToken_RejectsUnknownSigningKey(t *testing.T) {
	raw, _ := issueTestToken(t, nil)
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), fakeKeySource{}, raw, testAudience, "sekolah.sch.id", now)
	if !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("error = %v, want ErrTokenInvalid", err)
	}
}

func TestVerifyIDToken_RejectsMissingEmail(t *testing.T) {
	raw, keys := issueTestToken(t, func(c *idTokenClaims) { c.Email = "" })
	now := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)

	_, err := VerifyIDToken(context.Background(), keys, raw, testAudience, "sekolah.sch.id", now)
	if !errors.Is(err, ErrEmailMissing) {
		t.Errorf("error = %v, want ErrEmailMissing", err)
	}
}
