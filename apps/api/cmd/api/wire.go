package main

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
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

	eventBus := events.NewBus()
	schedulingModule := scheduling.Register(pool, eventBus, identityModule.Service)

	hub := realtime.NewHub(broadcasterFor(redisClient))
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pool, Bus: eventBus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: identityModule.Service, Hub: hub,
	})

	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Bus: eventBus, Storage: storageClientFor(cfg, logger),
		Clock: clock.Real{}, Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
	})

	doc, err := api.GetSpec()
	if err != nil {
		return nil, err
	}
	ops, err := authz.LoadOperationPermissions(doc)
	if err != nil {
		return nil, err
	}

	server := &combinedServer{
		Handler:           identityModule.Handler,
		TenantHandler:     schoolModule.Handler,
		SchedulingHandler: schedulingModule.Handler,
		AttendanceHandler: attendanceModule.Handler,
		AcademicHandler:   academicModule.Handler,
		PermitsHandler:    permitsModule.Handler,
		healthHandler:     &healthHandler{version: version, pool: pool, redis: redisClient},
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

	// Mounted after HandlerFromMux so these two routes replace its
	// generated GET /ws/me and GET /ws/monitor stubs (backed by
	// attendance's honest-501 strict handler) with the real WebSocket
	// upgrade -- see the doc comment on mountRealtimeRoutes in ws.go for
	// why a strict handler can never serve these itself. hub is the same
	// instance passed into attendance.Register above, so a socket opened
	// here is visible to the attendance module's monitor presence count.
	mountRealtimeRoutes(router, pool, tokenIssuer, hub, cfg.AppOrigins, logger)

	return router, nil
}

func broadcasterFor(redisClient *redis.Client) realtime.Broadcaster {
	if redisClient == nil {
		return nil
	}
	return realtime.NewRedisBroadcaster(redisClient)
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

// storageClientFor builds the S3 client when configured; permits degrades to
// "no uploads, no stored PDFs" without it so a dev box needs no MinIO.
func storageClientFor(cfg config.Config, logger *slog.Logger) permitsservice.Storage {
	if cfg.S3Endpoint == "" || cfg.S3Bucket == "" {
		logger.Warn("S3 not configured; uploads and document storage disabled")
		return nil
	}
	client, err := storage.NewClient(storage.Config{
		Endpoint: cfg.S3Endpoint, Bucket: cfg.S3Bucket, AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey, UseSSL: cfg.S3UseSSL,
	})
	if err != nil {
		logger.Warn("S3 client init failed; uploads disabled", "error", err)
		return nil
	}
	return client
}
