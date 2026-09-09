package httpx

import (
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// RealIP sets RemoteAddr from X-Forwarded-For / X-Real-IP only when the
// direct peer is one of trustedProxies (CIDR or bare IP); otherwise it
// leaves RemoteAddr untouched so a spoofed header from an untrusted client
// cannot impersonate another IP for rate limiting or audit logs.
func RealIP(trustedProxies []string) func(http.Handler) http.Handler {
	nets := make([]*net.IPNet, 0, len(trustedProxies))
	for _, p := range trustedProxies {
		if !strings.Contains(p, "/") {
			if strings.Contains(p, ":") {
				p += "/128"
			} else {
				p += "/32"
			}
		}
		if _, n, err := net.ParseCIDR(p); err == nil {
			nets = append(nets, n)
		}
	}

	trusted := func(remoteAddr string) bool {
		host, _, err := net.SplitHostPort(remoteAddr)
		if err != nil {
			host = remoteAddr
		}
		ip := net.ParseIP(host)
		if ip == nil {
			return false
		}
		for _, n := range nets {
			if n.Contains(ip) {
				return true
			}
		}
		return false
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(nets) > 0 && trusted(r.RemoteAddr) {
				if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
					if parts := strings.Split(fwd, ","); len(parts) > 0 {
						r.RemoteAddr = strings.TrimSpace(parts[0])
					}
				} else if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
					r.RemoteAddr = realIP
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// SecurityHeaders sets the baseline header set required by docs/08-security.md
// section 7. CSP is intentionally conservative; routes that render HTML
// (letters, documents) tighten it further per-route.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// BodyLimit caps the request body at limitBytes, per docs/08-security.md
// section 7. Handlers that accept uploads wrap their own route with a
// larger limit.
func BodyLimit(limitBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, limitBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// RequestMetaMiddleware captures the client IP and User-Agent for handlers
// that need them (login, refresh) but only receive ctx, not *http.Request.
// It must run after RealIP so the captured IP reflects the trusted-proxy
// adjustment, not the raw peer address.
func RequestMetaMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.RemoteAddr
		if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			host = h
		}
		ctx := WithRequestMeta(r.Context(), RequestMeta{IP: host, UserAgent: r.UserAgent()})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RefreshCookieMiddleware makes the web client's refresh_token cookie
// (if any) available via RefreshCookieFromContext. It exists because the
// oapi-codegen strict handlers only receive ctx and a typed request body,
// not the raw *http.Request, so a cookie not modeled as a formal OpenAPI
// parameter has to reach the handler through the context instead.
func RefreshCookieMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(RefreshCookieName); err == nil && c.Value != "" {
			r = r.WithContext(WithRefreshCookie(r.Context(), c.Value))
		}
		next.ServeHTTP(w, r)
	})
}

// RequestLogger emits one structured log line per request, including
// tenant_id when the tenant middleware has already resolved one.
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := clock.Real{}.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			attrs := []slog.Attr{
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", ww.Status()),
				slog.Int("bytes", ww.BytesWritten()),
				slog.Int64("duration_ms", time.Since(start).Milliseconds()),
				slog.String("request_id", RequestIDFromContext(r.Context())),
			}
			if tenantID, ok := TenantIDFromContext(r.Context()); ok {
				attrs = append(attrs, slog.String("tenant_id", tenantID.String()))
			}
			logger.LogAttrs(r.Context(), slog.LevelInfo, "http_request", attrs...)
		})
	}
}
