package auth

import (
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// KeyID is fixed for Phase 0 (single active signing key). Key rotation
// (docs/08-security.md section 8) introduces a second kid and a JWKS
// endpoint in a later phase.
const KeyID = "1"

// Claims is the access token payload: subject, tenant, session, and the
// role slugs active when the token was minted (effective permissions are
// recomputed server-side on every request via /v1/me and authz middleware,
// never trusted from the token alone).
type Claims struct {
	jwt.RegisteredClaims
	TenantID  string   `json:"tid"`
	SessionID string   `json:"sid"`
	Roles     []string `json:"roles"`
}

type TokenIssuer struct {
	key       *ecdsa.PrivateKey
	issuer    string
	accessTTL time.Duration
}

// ParseSigningKey decodes JWT_SIGNING_KEY: a base64-encoded PKCS#8 DER
// ES256 private key, as produced by cmd/keygen.
func ParseSigningKey(base64Key string) (*ecdsa.PrivateKey, error) {
	der, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return nil, fmt.Errorf("decode signing key base64: %w", err)
	}
	key, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, fmt.Errorf("parse signing key: %w", err)
	}
	ecKey, ok := key.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("signing key is not an ECDSA key")
	}
	return ecKey, nil
}

func NewTokenIssuer(key *ecdsa.PrivateKey, issuer string, accessTTL time.Duration) *TokenIssuer {
	return &TokenIssuer{key: key, issuer: issuer, accessTTL: accessTTL}
}

// IssueAccessToken mints a 15-minute ES256 access token per
// docs/08-security.md section 2.
func (i *TokenIssuer) IssueAccessToken(userID, tenantID, sessionID uuid.UUID, roles []string, now time.Time) (string, time.Time, error) {
	expiresAt := now.Add(i.accessTTL)
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			Issuer:    i.issuer,
		},
		TenantID:  tenantID.String(),
		SessionID: sessionID.String(),
		Roles:     roles,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = KeyID

	signed, err := token.SignedString(i.key)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign access token: %w", err)
	}
	return signed, expiresAt, nil
}

// VerifyAccessToken parses and validates an access token's signature and
// expiry, returning its claims. Session revocation is checked separately by
// the authn middleware against the sessions table/cache.
func (i *TokenIssuer) VerifyAccessToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodECDSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return &i.key.PublicKey, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("token invalid")
	}
	return claims, nil
}
