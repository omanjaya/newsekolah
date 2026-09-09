package oidc

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// GoogleJWKSURL is Google's published JSON Web Key Set for ID token
// signature verification.
const GoogleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

// jwksCacheTTL bounds how long a fetched key set is trusted before the
// next verification refetches it, so a rotated Google signing key is
// picked up without redeploying the API.
const jwksCacheTTL = 6 * time.Hour

// JWKSKeySource is a KeySource backed by an HTTP-fetched JSON Web Key Set,
// cached for jwksCacheTTL. It is safe for concurrent use.
type JWKSKeySource struct {
	url    string
	client *http.Client

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

// NewJWKSKeySource builds a key source for url using client (defaulting to
// http.DefaultClient when nil).
func NewJWKSKeySource(url string, client *http.Client) *JWKSKeySource {
	if client == nil {
		client = http.DefaultClient
	}
	return &JWKSKeySource{url: url, client: client}
}

// NewGoogleKeySource is NewJWKSKeySource pointed at Google's own JWKS.
func NewGoogleKeySource(client *http.Client) *JWKSKeySource {
	return NewJWKSKeySource(GoogleJWKSURL, client)
}

func (s *JWKSKeySource) Key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if key, ok := s.keys[kid]; ok && time.Since(s.fetchedAt) < jwksCacheTTL {
		return key, nil
	}
	if err := s.refreshLocked(ctx); err != nil {
		return nil, err
	}
	key, ok := s.keys[kid]
	if !ok {
		return nil, fmt.Errorf("oidc: no key %q in key set", kid)
	}
	return key, nil
}

type jwksDocument struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

// refreshLocked fetches and parses the key set. The caller must hold s.mu.
func (s *JWKSKeySource) refreshLocked(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.url, nil)
	if err != nil {
		return fmt.Errorf("oidc: build jwks request: %w", err)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("oidc: fetch jwks: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("oidc: jwks fetch returned %d: %s", resp.StatusCode, body)
	}

	var doc jwksDocument
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return fmt.Errorf("oidc: decode jwks: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(doc.Keys))
	for _, k := range doc.Keys {
		if k.Kty != "RSA" || k.Kid == "" {
			continue
		}
		pub, err := rsaPublicKeyFromJWK(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}

	s.keys = keys
	s.fetchedAt = clock.Real{}.Now()
	return nil
}

// rsaPublicKeyFromJWK decodes the base64url-encoded modulus (n) and
// exponent (e) of an RSA JWK into a *rsa.PublicKey.
func rsaPublicKeyFromJWK(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("decode modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("decode exponent: %w", err)
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: int(new(big.Int).SetBytes(eBytes).Int64()),
	}, nil
}
