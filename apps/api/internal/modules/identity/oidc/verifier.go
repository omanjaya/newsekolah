// Package oidc verifies Google OpenID Connect ID tokens for the identity
// module's "Sign in with Google" flow. It only verifies tokens handed to
// it by the caller (the client-side Google Identity Services button); it
// never performs the authorization-code exchange, so it has no need for a
// client secret.
package oidc

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrTokenInvalid covers a token that failed signature verification or one
// of the standard claim checks (issuer, audience, expiry).
var ErrTokenInvalid = errors.New("oidc: id token is invalid")

// ErrHostedDomainMismatch means the token verified but its "hd" claim does
// not match the tenant's configured Google Workspace domain.
var ErrHostedDomainMismatch = errors.New("oidc: hosted domain does not match")

// ErrEmailMissing means the token has no usable email claim to match
// against an existing user.
var ErrEmailMissing = errors.New("oidc: id token has no email claim")

// googleIssuers are the two issuer strings Google's ID tokens are observed
// to carry; either is accepted (https://developers.google.com/identity/
// openid-connect/openid-connect#validatinganidtoken).
var googleIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

// Claims is the subset of a verified ID token the login flow needs.
type Claims struct {
	Subject       string
	Email         string
	EmailVerified bool
	HostedDomain  string
	Name          string
}

// KeySource resolves a JWT key id to the RSA public key that signed it.
// The production implementation (see jwks.go) fetches and caches Google's
// published keys; tests supply a fixed map so verification never depends
// on the network.
type KeySource interface {
	Key(ctx context.Context, kid string) (*rsa.PublicKey, error)
}

// idTokenClaims is what the JWT library decodes; VerifyIDToken narrows it
// down to Claims once every check has passed.
type idTokenClaims struct {
	jwt.RegisteredClaims
	Email         string `json:"email"`
	EmailVerified any    `json:"email_verified"` // Google encodes this as a bool or a string depending on token type
	HostedDomain  string `json:"hd"`
	Name          string `json:"name"`
}

// VerifyIDToken checks an ID token's signature against keys, then its
// issuer, audience and expiry, and finally -- when hostedDomain is not
// empty -- that its "hd" claim matches it. now is injected so the expiry
// check is deterministic in tests rather than depending on wall-clock
// time.
func VerifyIDToken(ctx context.Context, keys KeySource, rawToken, audience, hostedDomain string, now time.Time) (Claims, error) {
	var claims idTokenClaims

	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithAudience(audience),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(func() time.Time { return now }),
	)

	_, err := parser.ParseWithClaims(rawToken, &claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("missing kid header")
		}
		key, keyErr := keys.Key(ctx, kid)
		if keyErr != nil {
			return nil, keyErr
		}
		return key, nil
	})
	if err != nil {
		return Claims{}, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}

	if !googleIssuers[claims.Issuer] {
		return Claims{}, fmt.Errorf("%w: unexpected issuer %q", ErrTokenInvalid, claims.Issuer)
	}
	if claims.Email == "" {
		return Claims{}, ErrEmailMissing
	}
	if hostedDomain != "" && claims.HostedDomain != hostedDomain {
		return Claims{}, ErrHostedDomainMismatch
	}

	return Claims{
		Subject:       claims.Subject,
		Email:         claims.Email,
		EmailVerified: asBool(claims.EmailVerified),
		HostedDomain:  claims.HostedDomain,
		Name:          claims.Name,
	}, nil
}

func asBool(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return t == "true"
	default:
		return false
	}
}
