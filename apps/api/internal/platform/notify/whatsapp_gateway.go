package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// gatewayWhatsAppSender posts to a school-operated local gateway instead
// of the Meta Cloud API: docs/12-roadmap.md Fase 5 requires WhatsApp to
// stay behind an adapter so a school can pick its own gateway rather than
// depend on Meta's (often costly) business API. The gateway's own contract
// is a single POST with a JSON body and one caller-configured auth header
// -- deliberately minimal, since a self-hosted gateway (e.g. a WhatsApp
// Web bridge) is the point.
type gatewayWhatsAppSender struct {
	url         string
	headerName  string
	headerValue string
	httpClient  *http.Client
}

// NewGatewayWhatsAppSender builds a WhatsAppSender that posts
// {"to": toPhone, "message": message} to url, with header (when
// headerName is non-empty) set to headerValue for authentication.
// httpClient may be nil for the default 10-second-timeout client.
func NewGatewayWhatsAppSender(url, headerName, headerValue string, httpClient *http.Client) WhatsAppSender {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &gatewayWhatsAppSender{url: url, headerName: headerName, headerValue: headerValue, httpClient: httpClient}
}

type gatewaySendResponse struct {
	MessageID string `json:"message_id"`
}

func (s *gatewayWhatsAppSender) Send(ctx context.Context, toPhone, message string) error {
	_, err := s.SendWithMessageID(ctx, toPhone, message)
	return err
}

// SendWithMessageID mirrors metaWhatsAppSender's optional method (see its
// comment): the gateway's response may carry a message_id field, recorded
// as the provider message id when present.
func (s *gatewayWhatsAppSender) SendWithMessageID(ctx context.Context, toPhone, message string) (string, error) {
	body, err := json.Marshal(map[string]string{"to": toPhone, "message": message})
	if err != nil {
		return "", fmt.Errorf("marshal gateway payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build gateway request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if s.headerName != "" {
		req.Header.Set(s.headerName, s.headerValue)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send gateway request: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read gateway response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("whatsapp gateway returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed gatewaySendResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", nil // sent successfully; a gateway that returns no JSON body just has no id to record
	}
	return parsed.MessageID, nil
}
