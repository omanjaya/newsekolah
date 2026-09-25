package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func performWithCleanup(t *testing.T, handler http.HandlerFunc) *http.Response {
	t.Helper()
	recorder := httptest.NewRecorder()
	LegacyRefreshCookieCleanup(handler).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/auth/refresh", nil))
	return recorder.Result()
}

func legacyClearCookies(response *http.Response) []string {
	var matches []string
	for _, value := range response.Header.Values("Set-Cookie") {
		if strings.HasPrefix(value, RefreshCookieName+"=") &&
			strings.Contains(value, "Path="+legacyRefreshCookiePath) {
			matches = append(matches, value)
		}
	}
	return matches
}

func TestLegacyRefreshCookieCleanupAppendsExpiryForNewPathCookie(t *testing.T) {
	response := performWithCleanup(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Set-Cookie", RefreshCookie("token-value", time.Now().Add(time.Hour), true))
		w.WriteHeader(http.StatusOK)
	})
	defer func() { _ = response.Body.Close() }()

	clears := legacyClearCookies(response)
	if len(clears) != 1 {
		t.Fatalf("want exactly one legacy-path clear cookie, got %d in %v", len(clears), response.Header.Values("Set-Cookie"))
	}
	if !strings.Contains(clears[0], "Max-Age=0") {
		t.Fatalf("legacy clear cookie must expire immediately, got %q", clears[0])
	}
	if !strings.Contains(clears[0], "Secure") {
		t.Fatalf("legacy clear cookie must mirror the Secure flag, got %q", clears[0])
	}
}

func TestLegacyRefreshCookieCleanupHandlesImplicitWriteHeader(t *testing.T) {
	response := performWithCleanup(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Set-Cookie", RefreshCookie("token-value", time.Now().Add(time.Hour), false))
		if _, err := w.Write([]byte("{}")); err != nil {
			t.Fatalf("write: %v", err)
		}
	})
	defer func() { _ = response.Body.Close() }()

	if len(legacyClearCookies(response)) != 1 {
		t.Fatalf("want the legacy clear even without an explicit WriteHeader, got %v", response.Header.Values("Set-Cookie"))
	}
}

func TestLegacyRefreshCookieCleanupLeavesOtherResponsesAlone(t *testing.T) {
	response := performWithCleanup(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Set-Cookie", "session_hint=abc; Path=/; HttpOnly")
		w.WriteHeader(http.StatusOK)
	})
	defer func() { _ = response.Body.Close() }()

	if len(legacyClearCookies(response)) != 0 {
		t.Fatalf("must not touch responses without a refresh cookie, got %v", response.Header.Values("Set-Cookie"))
	}
	if got := len(response.Header.Values("Set-Cookie")); got != 1 {
		t.Fatalf("want the original cookie untouched, got %d headers", got)
	}
}

func TestLegacyRefreshCookieCleanupSkipsWhenLegacyPathAlreadyCleared(t *testing.T) {
	response := performWithCleanup(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Add("Set-Cookie", expiredLegacyRefreshCookie(false))
		w.WriteHeader(http.StatusOK)
	})
	defer func() { _ = response.Body.Close() }()

	if got := len(response.Header.Values("Set-Cookie")); got != 1 {
		t.Fatalf("must not double-append the legacy clear, got %d headers", got)
	}
}

func TestLegacyRefreshCookieCleanupAllowsHijack(t *testing.T) {
	server := httptest.NewServer(LegacyRefreshCookieCleanup(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			t.Error("wrapped writer must implement http.Hijacker for WebSocket upgrades")
			return
		}
		conn, _, err := hijacker.Hijack()
		if err != nil {
			t.Errorf("hijack: %v", err)
			return
		}
		_, _ = conn.Write([]byte("HTTP/1.1 204 No Content\r\n\r\n"))
		_ = conn.Close()
	})))
	defer server.Close()

	response, err := http.Get(server.URL)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("want 204 written on the hijacked connection, got %d", response.StatusCode)
	}
}
