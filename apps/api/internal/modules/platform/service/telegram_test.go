package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// withFakeTelegram points telegramAPIBase at server for the duration of one
// test, restoring the real endpoint afterwards so tests never leak state
// into each other (go test runs a package's tests sequentially by
// default, but this keeps the intent explicit either way).
func withFakeTelegram(t *testing.T, server *httptest.Server) {
	t.Helper()
	original := telegramAPIBase
	telegramAPIBase = server.URL
	t.Cleanup(func() { telegramAPIBase = original })
}

func TestTelegramGetUpdates_DedupsAndPicksTitle(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/bottest-token/getUpdates") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"ok": true,
			"result": [
				{"message": {"chat": {"id": 111, "type": "private", "first_name": "Budi"}}},
				{"message": {"chat": {"id": 222, "type": "group", "title": "Grup Operator"}}},
				{"message": {"chat": {"id": 222, "type": "group", "title": "Grup Operator"}}},
				{"my_chat_member": {"chat": {"id": 333, "type": "channel", "username": "sekolah_ops"}}}
			]
		}`))
	}))
	defer server.Close()
	withFakeTelegram(t, server)

	candidates, err := telegramGetUpdates(context.Background(), "test-token")
	if err != nil {
		t.Fatalf("telegramGetUpdates: unexpected error: %v", err)
	}
	if len(candidates) != 3 {
		t.Fatalf("len(candidates) = %d, want 3 (chat 222 must be deduped)", len(candidates))
	}
	want := []domain.TelegramChatCandidate{
		{ID: 111, Type: "private", Title: "Budi"},
		{ID: 222, Type: "group", Title: "Grup Operator"},
		{ID: 333, Type: "channel", Title: "sekolah_ops"},
	}
	for i, w := range want {
		if candidates[i] != w {
			t.Errorf("candidates[%d] = %+v, want %+v", i, candidates[i], w)
		}
	}
}

func TestTelegramSendMessage_Success(t *testing.T) {
	var gotBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/bottest-token/sendMessage") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		buf, _ := io.ReadAll(r.Body)
		gotBody = string(buf)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok": true, "result": {"message_id": 1}}`))
	}))
	defer server.Close()
	withFakeTelegram(t, server)

	if err := telegramSendMessage(context.Background(), "test-token", "12345", "halo"); err != nil {
		t.Fatalf("telegramSendMessage: unexpected error: %v", err)
	}
	if !strings.Contains(gotBody, `"chat_id":"12345"`) || !strings.Contains(gotBody, `"text":"halo"`) {
		t.Errorf("request body = %q, missing expected fields", gotBody)
	}
}

func TestTelegramSendMessage_APIError_NeverLeaksToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok": false, "description": "chat not found"}`))
	}))
	defer server.Close()
	withFakeTelegram(t, server)

	err := telegramSendMessage(context.Background(), "super-secret-token", "bad-chat", "halo")
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !errors.Is(err, domain.ErrTelegramAPI) {
		t.Fatalf("error = %v, want it to wrap domain.ErrTelegramAPI", err)
	}
	if !strings.Contains(err.Error(), "chat not found") {
		t.Errorf("error = %q, want it to carry telegram's description", err.Error())
	}
	if strings.Contains(err.Error(), "super-secret-token") {
		t.Fatalf("error = %q, must never contain the bot token", err.Error())
	}
}

func TestTelegramCall_UnreachableNeverLeaksToken(t *testing.T) {
	// A server that is immediately closed guarantees a transport-level
	// failure (connection refused), the case whose *url.Error would embed
	// the request URL -- and therefore the token -- if telegramCall did
	// not replace it with the generic sentinel.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	server.Close()
	withFakeTelegram(t, server)

	err := telegramSendMessage(context.Background(), "super-secret-token", "12345", "halo")
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !errors.Is(err, domain.ErrTelegramRequest) {
		t.Fatalf("error = %v, want it to wrap domain.ErrTelegramRequest", err)
	}
	if strings.Contains(err.Error(), "super-secret-token") {
		t.Fatalf("error = %q, must never contain the bot token", err.Error())
	}
}
