package main

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// buildRouter wires the two Phase 0 modules and every platform middleware
// into a single http.Handler. It is the one function both main() and the
// integration tests call, so a test never risks exercising wiring that
// production does not.
func buildRouter(cfg config.Config, logger *slog.Logger, pool *pgxpool.Pool, redisClient *redis.Client, version string) (http.Handler, error) {
	store := kvStoreFor(redisClient)

	signingKey, err := auth.ParseSigningKey(cfg.JWTSigningKey)
	if err != nil {
		return nil, err
	}
	tokenIssuer := auth.NewTokenIssuer(signingKey, "newsekolah", cfg.AccessTokenTTL)
	sessionCache := auth.NewSessionCache(store)
	rateLimiter := auth.NewLoginRateLimiter(store)

	mode := tenant.ModeSingle
	if cfg.TenancyMode == config.TenancyMulti {
		mode = tenant.ModeMulti
	}

	schoolModule := school.Register(pool, mode)
	identityModule := identity.Register(identity.Dependencies{
		Pool:         pool,
		Years:        schoolModule.Service,
		Limiter:      rateLimiter,
		Tokens:       tokenIssuer,
		Clock:        clock.Real{},
		Config:       identityservice.Config{RefreshTokenTTL: cfg.RefreshTokenTTL},
		Branding:     schoolModule.Handler,
		SessionCache: sessionCache,
		IsProduction: cfg.IsProduction(),
	})

	academicModule := academic.Register(pool, clock.Real{})

	authenticator := auth.NewAuthenticator(tokenIssuer, sessionCache, identityModule.Service)

	doc, err := api.GetSpec()
	if err != nil {
		return nil, err
	}
	ops, err := authz.LoadOperationPermissions(doc)
	if err != nil {
		return nil, err
	}

	server := &combinedServer{
		Handler:         identityModule.Handler,
		TenantHandler:   schoolModule.Handler,
		AcademicHandler: academicModule.Handler,
		healthHandler:   &healthHandler{version: version, pool: pool, redis: redisClient},
	}

	strict := api.NewStrictHandlerWithOptions(
		server,
		[]api.StrictMiddlewareFunc{authzStrictMiddleware(ops, identityModule.Service)},
		api.StrictHTTPServerOptions{
			RequestErrorHandlerFunc:  decodeErrorHandler,
			ResponseErrorHandlerFunc: responseErrorHandler,
		},
	)

	router := httpx.NewRouter(httpx.RouterConfig{
		AppOrigins:     cfg.AppOrigins,
		TrustedProxies: cfg.TrustedProxies,
		BodyLimitBytes: cfg.BodyLimitBytes,
		Logger:         logger,
	})
	router.Use(tenant.Middleware(mode, schoolModule.Loader, cfg.BaseDomain))
	router.Use(httpx.RefreshCookieMiddleware)
	router.Use(authenticator.Middleware)

	api.HandlerFromMux(strict, router)

	return router, nil
}

func kvStoreFor(redisClient *redis.Client) auth.KVStore {
	if redisClient == nil {
		return auth.NewMemoryStore()
	}
	return auth.NewRedisStore(redisClient)
}

func newRedisClient(redisURL string, logger *slog.Logger) *redis.Client {
	if redisURL == "" {
		logger.Warn("REDIS_URL empty, using in-memory rate limit and session cache (single-instance only)")
		return nil
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		logger.Warn("invalid REDIS_URL, falling back to in-memory store", "error", err)
		return nil
	}
	return redis.NewClient(opts)
}
