package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRoleTestingCookieMiddlewarePreservesSeparateSetCookieHeaders(t *testing.T) {
	at := time.Now().Add(30 * time.Minute)
	handler := RoleTestingCookieMiddleware(false)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		QueueRoleTestingCookie(r.Context(), RoleTestingCookie("sealed-proof", at, false))
		w.Header().Set("Set-Cookie", RefreshCookie("child-refresh", at, false))
		w.WriteHeader(http.StatusOK)
	}))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/v1/auth/role-testing/start", nil))
	cookies := recorder.Result().Cookies()
	if len(cookies) != 2 || cookies[0].Name != RefreshCookieName || cookies[1].Name != RoleTestingCookieName {
		t.Fatalf("expected separate refresh and proof cookies, got %v", recorder.Header().Values("Set-Cookie"))
	}
	for _, cookie := range cookies {
		if !cookie.HttpOnly || cookie.Path != "/" || cookie.SameSite != http.SameSiteLaxMode {
			t.Errorf("cookie attributes unexpected: %+v", cookie)
		}
	}
}

func TestRoleTestingCookieClearedOnLoginAndLogout(t *testing.T) {
	for _, path := range []string{"/v1/auth/login", "/v1/auth/logout"} {
		t.Run(path, func(t *testing.T) {
			handler := RoleTestingCookieMiddleware(false)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, path, nil))
			values := recorder.Header().Values("Set-Cookie")
			if len(values) != 1 || !strings.HasPrefix(values[0], RoleTestingCookieName+"=") || !strings.Contains(values[0], "Max-Age=0") {
				t.Errorf("expected expired proof cookie, got %v", values)
			}
		})
	}
}
