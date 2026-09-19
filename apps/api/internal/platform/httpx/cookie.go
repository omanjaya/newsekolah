package httpx

import (
	"net/http"
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
