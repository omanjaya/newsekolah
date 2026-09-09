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

// metaWhatsAppSender sends a WhatsApp Cloud API template message. Templates
// (not free-form text) are required outside a customer-initiated 24-hour
// session, which is the common case for a school-initiated notification.
// The template is expected to already exist as an approved template with a
// single body parameter -- schools provision that template name in their
// WhatsApp Business Manager; this sender does not manage templates.
type metaWhatsAppSender struct {
	token        string
	phoneID      string
	templateName string
	locale       string
	httpClient   *http.Client
	// baseURL defaults to the real Graph API and is only overridden by
	// this package's own tests, which point it at an httptest.Server so
	// the real WhatsApp API is never called.
	baseURL string
}

const metaGraphBaseURL = "https://graph.facebook.com/v20.0"

// defaultMetaTemplateName and defaultMetaLocale are used for a send that
// carries no specific domain.WhatsAppTemplate (the generic notification
// path predating per-tenant templates): a single approved template named
// "notification_text" that every school provisions once.
const (
	defaultMetaTemplateName = "notification_text"
	defaultMetaLocale       = "id"
)

// newMetaWhatsAppSender builds the sender for the deployment-wide
// WHATSAPP_PROVIDER=meta env configuration (the fallback used when a
// tenant has not configured its own provider), always against the
// default template.
func newMetaWhatsAppSender(token, phoneID string) WhatsAppSender {
	return NewMetaWhatsAppSender(token, phoneID, defaultMetaTemplateName, defaultMetaLocale, nil)
}

// NewMetaWhatsAppSender builds a WhatsAppSender that calls the Meta Cloud
// API, sending templateName/locale as the message template and message as
// its single body parameter. httpClient may be nil, for the default
// 10-second-timeout client (tests inject their own, pointed at a fake
// server).
func NewMetaWhatsAppSender(token, phoneID, templateName, locale string, httpClient *http.Client) WhatsAppSender {
	if templateName == "" {
		templateName = defaultMetaTemplateName
	}
	if locale == "" {
		locale = defaultMetaLocale
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &metaWhatsAppSender{token: token, phoneID: phoneID, templateName: templateName, locale: locale, httpClient: httpClient, baseURL: metaGraphBaseURL}
}

func (s *metaWhatsAppSender) Send(ctx context.Context, toPhone, message string) error {
	_, err := s.SendWithMessageID(ctx, toPhone, message)
	return err
}

// SendWithMessageID is the WhatsAppSender.Send behavior plus the wamid
// Meta assigns to the message, which the delivery log records so a later
// status webhook (keyed by that id) can find the row to update. Exposed as
// an additional method rather than changing the WhatsAppSender interface
// signature; transport/jobs type-asserts for it opportunistically.
func (s *metaWhatsAppSender) SendWithMessageID(ctx context.Context, toPhone, message string) (string, error) {
	body, err := json.Marshal(map[string]any{
		"messaging_product": "whatsapp",
		"to":                toPhone,
		"type":              "template",
		"template": map[string]any{
			"name":     s.templateName,
			"language": map[string]string{"code": s.locale},
			"components": []map[string]any{
				{
					"type": "body",
					"parameters": []map[string]string{
						{"type": "text", "text": message},
					},
				},
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("marshal WhatsApp payload: %w", err)
	}

	url := fmt.Sprintf("%s/%s/messages", s.baseURL, s.phoneID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build WhatsApp request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send WhatsApp message: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read WhatsApp response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("WhatsApp Cloud API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil || len(parsed.Messages) == 0 {
		return "", nil // sent successfully; Meta's response shape was unexpected, so no id to record
	}
	return parsed.Messages[0].ID, nil
}
