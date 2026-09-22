package notify

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

const (
	// #nosec G101 -- not a credential, an endpoint URL
	fcmTokenURL = "https://oauth2.googleapis.com/token" //nolint:gosec // not a credential, an endpoint URL
	fcmScope    = "https://www.googleapis.com/auth/firebase.messaging"
)

// FCMConfig is a Google service account, used directly (no firebase-admin
// SDK) to sign a JWT bearer assertion, exchange it for an OAuth2 access
// token, and call FCM's HTTP v1 send endpoint with plain net/http.
type FCMConfig struct {
	ProjectID          string
	ServiceAccountJSON string // the service account key file's raw JSON contents
}

type fcmServiceAccount struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

type fcmSender struct {
	projectID  string
	email      string
	privateKey *rsa.PrivateKey
	tokenURI   string
	httpClient *http.Client

	clk clock.Clock

	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

// NewFCMSender returns nil when cfg is not configured (Android-less
// schools need no FCM credentials).
func NewFCMSender(cfg FCMConfig) (PushSender, error) {
	if cfg.ProjectID == "" || cfg.ServiceAccountJSON == "" {
		return nil, nil
	}

	var sa fcmServiceAccount
	if err := json.Unmarshal([]byte(cfg.ServiceAccountJSON), &sa); err != nil {
		return nil, fmt.Errorf("parse FCM service account JSON: %w", err)
	}
	key, err := parseRSAPrivateKey(sa.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("parse FCM service account private key: %w", err)
	}
	tokenURI := sa.TokenURI
	if tokenURI == "" {
		tokenURI = fcmTokenURL
	}

	return &fcmSender{
		projectID:  cfg.ProjectID,
		email:      sa.ClientEmail,
		privateKey: key,
		tokenURI:   tokenURI,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		clk:        clock.Real{},
	}, nil
}

func parseRSAPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("not a valid PEM block")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	generic, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := generic.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not RSA")
	}
	return key, nil
}

// accessTokenFor implements the JWT bearer flow (RFC 7523): a self-signed
// RS256 assertion claiming fcmScope, exchanged at tokenURI for a bearer
// access token good for about an hour, cached until shortly before expiry.
func (s *fcmSender) accessTokenFor(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.accessToken != "" && s.clk.Now().Before(s.expiresAt) {
		return s.accessToken, nil
	}

	now := s.clk.Now()
	claims := jwt.MapClaims{
		"iss":   s.email,
		"scope": fcmScope,
		"aud":   s.tokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(1 * time.Hour).Unix(),
	}
	assertion, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(s.privateKey)
	if err != nil {
		return "", fmt.Errorf("sign FCM JWT assertion: %w", err)
	}

	form := fmt.Sprintf("grant_type=%s&assertion=%s",
		"urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer", assertion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.tokenURI, bytes.NewBufferString(form))
	if err != nil {
		return "", fmt.Errorf("build FCM token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("exchange FCM token: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()

	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("FCM token endpoint returned status %d: %s", resp.StatusCode, string(body))
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode FCM token response: %w", err)
	}

	s.accessToken = out.AccessToken
	s.expiresAt = now.Add(time.Duration(out.ExpiresIn-60) * time.Second)
	return s.accessToken, nil
}

func (s *fcmSender) Send(ctx context.Context, device PushDevice, payload PushPayload) error {
	token, err := s.accessTokenFor(ctx)
	if err != nil {
		return err
	}

	data := map[string]string{"href": payload.Href}
	for k, v := range payload.Data {
		data[k] = v
	}

	body, err := json.Marshal(map[string]any{
		"message": map[string]any{
			"token": device.TokenOrEndpoint,
			"notification": map[string]string{
				"title": payload.Title,
				"body":  payload.Body,
			},
			"data": data,
		},
	})
	if err != nil {
		return fmt.Errorf("marshal FCM payload: %w", err)
	}

	url := fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", s.projectID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build FCM send request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send FCM push: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return ErrDeviceGone
	}
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		if bytes.Contains(respBody, []byte("UNREGISTERED")) {
			return ErrDeviceGone
		}
		return fmt.Errorf("FCM send returned status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}
