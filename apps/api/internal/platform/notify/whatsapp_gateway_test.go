package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGatewayWhatsAppSender_SendWithMessageID(t *testing.T) {
	var gotHeader string
	var gotBody map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("X-Gateway-Key")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &gotBody)
		_, _ = w.Write([]byte(`{"message_id":"gw-42"}`))
	}))
	defer server.Close()

	sender := NewGatewayWhatsAppSender(server.URL, "X-Gateway-Key", "secret-value", server.Client())

	id, err := sender.(interface {
		SendWithMessageID(ctx context.Context, toPhone, message string) (string, error)
	}).SendWithMessageID(context.Background(), "+6281234567890", "Halo")
	if err != nil {
		t.Fatalf("SendWithMessageID: unexpected error: %v", err)
	}
	if id != "gw-42" {
		t.Fatalf("id = %q, want gw-42", id)
	}
	if gotHeader != "secret-value" {
		t.Fatalf("X-Gateway-Key header = %q, want secret-value", gotHeader)
	}
	if gotBody["to"] != "+6281234567890" || gotBody["message"] != "Halo" {
		t.Fatalf("request body = %v, unexpected", gotBody)
	}
}

func TestGatewayWhatsAppSender_Send_ErrorStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	sender := NewGatewayWhatsAppSender(server.URL, "", "", server.Client())
	if err := sender.Send(context.Background(), "+62", "hi"); err == nil {
		t.Fatal("expected error for 503 response")
	}
}

func TestGatewayWhatsAppSender_NoAuthHeaderWhenNameEmpty(t *testing.T) {
	var sawAnyAuthHeader bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for name := range r.Header {
			if name == "X-Gateway-Key" {
				sawAnyAuthHeader = true
			}
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	sender := NewGatewayWhatsAppSender(server.URL, "", "", server.Client())
	if err := sender.Send(context.Background(), "+62", "hi"); err != nil {
		t.Fatalf("Send: unexpected error: %v", err)
	}
	if sawAnyAuthHeader {
		t.Fatal("expected no auth header when headerName is empty")
	}
}
