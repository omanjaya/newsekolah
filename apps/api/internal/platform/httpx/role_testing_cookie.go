package httpx

import (
	"bufio"
	"context"
	"net"
	"net/http"
	"strings"
	"time"
)

const RoleTestingCookieName = "role_testing_parent"

func RoleTestingCookie(value string, expiresAt time.Time, secure bool) string {
	// #nosec G124 -- Secure follows APP_ENV, matching the refresh cookie.
	return (&http.Cookie{ //nolint:gosec // development uses HTTP locally
		Name: RoleTestingCookieName, Value: value, Path: "/", HttpOnly: true,
		Secure: secure, SameSite: http.SameSiteLaxMode, Expires: expiresAt,
	}).String()
}

func ExpiredRoleTestingCookie(secure bool) string {
	// #nosec G124 -- Secure follows APP_ENV, matching the refresh cookie.
	return (&http.Cookie{ //nolint:gosec // development uses HTTP locally
		Name: RoleTestingCookieName, Path: "/", HttpOnly: true,
		Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	}).String()
}

// RoleTestingCookieMiddleware makes the sealed parent continuation
// available to strict handlers and appends its separate Set-Cookie header.
// Successful fresh sign-in or logout clears stale continuation proof.
func RoleTestingCookieMiddleware(secure bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			if cookie, err := r.Cookie(RoleTestingCookieName); err == nil && cookie.Value != "" {
				ctx = withRoleTestingCookie(ctx, cookie.Value)
			}
			sink := &roleTestingCookieSink{}
			ctx = context.WithValue(ctx, roleTestingCookieSinkKey, sink)
			writer := &roleTestingCookieWriter{ResponseWriter: w, sink: sink, path: r.URL.Path, secure: secure}
			next.ServeHTTP(writer, r.WithContext(ctx))
		})
	}
}

type roleTestingCookieWriter struct {
	http.ResponseWriter
	sink   *roleTestingCookieSink
	path   string
	secure bool
	done   bool
}

func (w *roleTestingCookieWriter) WriteHeader(status int) {
	w.appendCookie(status)
	w.ResponseWriter.WriteHeader(status)
}

func (w *roleTestingCookieWriter) Write(body []byte) (int, error) {
	w.appendCookie(http.StatusOK)
	return w.ResponseWriter.Write(body)
}

func (w *roleTestingCookieWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *roleTestingCookieWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return http.NewResponseController(w.ResponseWriter).Hijack()
}

func (w *roleTestingCookieWriter) appendCookie(status int) {
	if w.done {
		return
	}
	w.done = true
	value := w.sink.value
	if value == "" && status >= 200 && status < 300 && freshAuthPath(w.path) {
		value = ExpiredRoleTestingCookie(w.secure)
	}
	if value == "" && status == http.StatusUnauthorized && w.path == "/v1/auth/role-testing/stop" {
		value = ExpiredRoleTestingCookie(w.secure)
	}
	if value != "" {
		w.Header().Add("Set-Cookie", value)
	}
}

func freshAuthPath(path string) bool {
	return path == "/v1/auth/login" || path == "/v1/auth/logout" || path == "/v1/auth/sso/google" || strings.HasPrefix(path, "/v1/auth/passkeys/login")
}
