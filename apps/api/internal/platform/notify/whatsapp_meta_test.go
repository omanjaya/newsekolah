package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMetaWhatsAppSender_SendWithMessageID(t *testing.T) {
	var gotBody map[string]any
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &gotBody)
		if !strings.HasSuffix(r.URL.Path, "/PHONE123/messages") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"messages":[{"id":"wamid.abc123"}]}`))
	}))
	defer server.Close()

	sender := &metaWhatsAppSender{
		token: "test-token", phoneID: "PHONE123", templateName: "notification_text", locale: "id",
		httpClient: server.Client(), baseURL: server.URL,
	}

	id, err := sender.SendWithMessageID(context.Background(), "+6281234567890", "Halo dari sekolah")
	if err != nil {
		t.Fatalf("SendWithMessageID: unexpected error: %v", err)
	}
	if id != "wamid.abc123" {
		t.Fatalf("id = %q, want wamid.abc123", id)
	}
	if gotAuth != "Bearer test-token" {
		t.Fatalf("Authorization header = %q, want Bearer test-token", gotAuth)
	}
	template, ok := gotBody["template"].(map[string]any)
	if !ok {
		t.Fatalf("request body missing template object: %v", gotBody)
	}
	if template["name"] != "notification_text" {
		t.Fatalf("template name = %v, want notification_text", template["name"])
	}
}

func TestMetaWhatsAppSender_Send_ErrorStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid phone number"}}`))
	}))
	defer server.Close()

	sender := &metaWhatsAppSender{
		token: "t", phoneID: "PHONE123", templateName: "notification_text", locale: "id",
		httpClient: server.Client(), baseURL: server.URL,
	}

	if err := sender.Send(context.Background(), "+62", "hi"); err == nil {
		t.Fatal("expected error for 400 response")
	}
}

func TestMetaWhatsAppSender_Send_NetworkFailureNeverHitsRealAPI(t *testing.T) {
	// baseURL points nowhere real: this test (and every other test in this
	// file) never reaches graph.facebook.com, satisfying the requirement
	// that the real WhatsApp API is never called from tests.
	sender := &metaWhatsAppSender{
		token: "t", phoneID: "PHONE123", templateName: "notification_text", locale: "id",
		httpClient: http.DefaultClient, baseURL: "http://127.0.0.1:0",
	}
	if err := sender.Send(context.Background(), "+62", "hi"); err == nil {
		t.Fatal("expected error connecting to an unreachable address")
	}
}
