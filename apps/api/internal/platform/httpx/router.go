package httpx

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type RouterConfig struct {
	AppOrigins     []string
	TrustedProxies []string
	BodyLimitBytes int64
	Logger         *slog.Logger
}

// NewRouter builds the base chi router with the middleware stack required by
// docs/03-layered-architecture.md section 2: request id, real ip, recovery,
// timeout, body limit, security headers, CORS, and structured logging.
// Tenant resolution and authentication are mounted by cmd/api after this,
// since they need module-specific dependencies.
func NewRouter(cfg RouterConfig) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(RealIP(cfg.TrustedProxies))
	r.Use(RequestMetaMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(BodyLimit(cfg.BodyLimitBytes))
	r.Use(SecurityHeaders)
	r.Use(CORS(cfg.AppOrigins))
	r.Use(RequestLogger(cfg.Logger))

	return r
}

// CORS allows only the configured origins, with credentials, matching
// docs/08-security.md section 7 (no wildcard, ever).
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
			}
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Tenant, X-Client, Accept-Language, Idempotency-Key")
				w.Header().Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
