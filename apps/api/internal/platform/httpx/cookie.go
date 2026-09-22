package httpx

import (
	"net/http"
	"strings"
	"time"
)

const RefreshCookieName = "refresh_token"

// RefreshCookiePath is "/" rather than the narrower "/v1/auth" the token's
// own consumer (POST /v1/auth/refresh) needs, because apps/web/middleware.ts
// also has to read this cookie on ordinary document navigations (any path
// under the (app) route group) to run its bounded, once-per-TTL refresh --
// a Cookie's Path attribute is a single prefix, so there is no way to scope
// it to "/v1/auth" and every (app) route at once (docs/08-security.md
// section 2). Widening it does not weaken anything the narrow path was
// protecting: the cookie is httpOnly (never readable by page JS regardless
// of Path) and SameSite=Lax (never sent cross-site regardless of Path), and
// nothing except RefreshCookieMiddleware ever reads it, so a wider Path
// only means it now also rides along on same-origin requests it is not
// used by (the ordinary cost of a "/"-scoped session cookie, same as most
// frameworks default to). CSRF protection on the refresh endpoint itself
// is unaffected: it comes from SameSite=Lax plus the Origin check in
// OriginAllowed, neither of which depends on Path.
const RefreshCookiePath = "/"

// RefreshCookie renders the Set-Cookie value for a web client's refresh
// token: httpOnly, SameSite=Lax, scoped to RefreshCookiePath, Secure only
// outside development (docs/08-security.md section 2).
func RefreshCookie(value string, expiresAt time.Time, secure bool) string {
	// #nosec G124 -- Secure is intentionally conditional: false only outside APP_ENV=production, per docs/08-security.md
	c := &http.Cookie{ //nolint:gosec // Secure is intentionally conditional: false only outside APP_ENV=production, per docs/08-security.md
		Name:     RefreshCookieName,
		Value:    value,
		Path:     RefreshCookiePath,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
	}
	return c.String()
}

// ExpiredRefreshCookie clears the refresh cookie on logout.
func ExpiredRefreshCookie(secure bool) string {
	// #nosec G124 -- Secure is intentionally conditional: false only outside APP_ENV=production, per docs/08-security.md
	c := &http.Cookie{ //nolint:gosec // Secure is intentionally conditional: false only outside APP_ENV=production, per docs/08-security.md
		Name:     RefreshCookieName,
		Value:    "",
		Path:     RefreshCookiePath,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	}
	return c.String()
}

// legacyRefreshCookiePath is the pre-widening RefreshCookiePath. Sessions
// created before the widening still hold a refresh_token cookie scoped to
// it, and once a rotation issues the "/"-scoped cookie the browser keeps
// both, sending the legacy one FIRST (RFC 6265 orders longer paths first).
// A refresh would then read the stale, already-rotated legacy value and
// treat it as reuse -- revoking the whole session family (section 2 of
// docs/08-security.md). Every response that issues a "/"-scoped refresh
// cookie therefore also expires the legacy one. Removable once every
// pre-widening session has aged out (one refresh-token TTL after the
// widening shipped).
const legacyRefreshCookiePath = "/v1/auth"

func expiredLegacyRefreshCookie(secure bool) string {
	// #nosec G124 -- Secure mirrors the cookie being cleared, per docs/08-security.md
	c := &http.Cookie{ //nolint:gosec // Secure mirrors the cookie being cleared, per docs/08-security.md
		Name:     RefreshCookieName,
		Value:    "",
		Path:     legacyRefreshCookiePath,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	}
	return c.String()
}

// LegacyRefreshCookieCleanup appends the legacy-path expiry cookie to any
// response that sets a "/"-scoped refresh_token cookie (login, refresh,
// SSO, logout). The generated handler types only carry one Set-Cookie
// header, so this lives here, at the response boundary, instead of in the
// five call sites that mint the cookie.
func LegacyRefreshCookieCleanup(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(&legacyCookieCleanupWriter{ResponseWriter: w}, r)
	})
}

type legacyCookieCleanupWriter struct {
	http.ResponseWriter
	done bool
}

func (w *legacyCookieCleanupWriter) WriteHeader(status int) {
	w.appendLegacyClear()
	w.ResponseWriter.WriteHeader(status)
}

func (w *legacyCookieCleanupWriter) Write(b []byte) (int, error) {
	w.appendLegacyClear()
	return w.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach Flush/Hijack on the wrapped writer.
func (w *legacyCookieCleanupWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *legacyCookieCleanupWriter) appendLegacyClear() {
	if w.done {
		return
	}
	w.done = true
	header := w.ResponseWriter.Header()
	for _, value := range header.Values("Set-Cookie") {
		if !strings.HasPrefix(value, RefreshCookieName+"=") {
			continue
		}
		if strings.Contains(value, "Path="+legacyRefreshCookiePath) {
			return // already clearing the legacy path; nothing to add
		}
		if strings.Contains(value, "Path="+RefreshCookiePath) {
			header.Add("Set-Cookie", expiredLegacyRefreshCookie(strings.Contains(value, "Secure")))
			return
		}
	}
}
