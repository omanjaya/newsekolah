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
// notification_text is expected to already exist as an approved template
// with a single body parameter -- schools provision that template name in
// their WhatsApp Business Manager; this sender does not manage templates.
type metaWhatsAppSender struct {
	token      string
	phoneID    string
	httpClient *http.Client
}

func newMetaWhatsAppSender(token, phoneID string) WhatsAppSender {
	return &metaWhatsAppSender{token: token, phoneID: phoneID, httpClient: &http.Client{Timeout: 10 * time.Second}}
}

const metaTemplateName = "notification_text"

func (s *metaWhatsAppSender) Send(ctx context.Context, toPhone, message string) error {
	body, err := json.Marshal(map[string]any{
		"messaging_product": "whatsapp",
		"to":                toPhone,
		"type":              "template",
		"template": map[string]any{
			"name":     metaTemplateName,
			"language": map[string]string{"code": "id"},
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
		return fmt.Errorf("marshal WhatsApp payload: %w", err)
	}

	url := fmt.Sprintf("https://graph.facebook.com/v20.0/%s/messages", s.phoneID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build WhatsApp request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send WhatsApp message: %w", err)
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("WhatsApp Cloud API returned status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}
