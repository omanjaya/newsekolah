package httpx

import (
	"net/http"
	"time"
)

const RefreshCookieName = "refresh_token"
const RefreshCookiePath = "/v1/auth"

// RefreshCookie renders the Set-Cookie value for a web client's refresh
// token: httpOnly, SameSite=Lax, scoped to /v1/auth, Secure only outside
// development (docs/08-security.md section 2).
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
