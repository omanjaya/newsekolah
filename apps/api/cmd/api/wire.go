package main

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// buildRouter wires the two Phase 0 modules and every platform middleware
// into a single http.Handler. It is the one function both main() and the
// integration tests call, so a test never risks exercising wiring that
// production does not.
func buildRouter(cfg config.Config, logger *slog.Logger, pool *pgxpool.Pool, redisClient *redis.Client, version string) (http.Handler, *background, error) {
	store := kvStoreFor(redisClient)

	signingKey, err := auth.ParseSigningKey(cfg.JWTSigningKey)
	if err != nil {
		return nil, nil, err
	}
	tokenIssuer := auth.NewTokenIssuer(signingKey, "newsekolah", cfg.AccessTokenTTL)
	sessionCache := auth.NewSessionCache(store)
	rateLimiter := auth.NewLoginRateLimiter(store)

	mode := tenant.ModeSingle
	if cfg.TenancyMode == config.TenancyMulti {
		mode = tenant.ModeMulti
	}

	schoolModule := school.Register(pool, mode)
	senders := wiring.SendersFromConfig(cfg, logger)
	sealer, err := crypto.NewSealer("v1", cfg.EncryptionSecret())
	if err != nil {
		return nil, nil, err
	}
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
		Email:        senders.Email,
		MfaSealer:    sealer,
	})

	academicModule := academic.Register(pool, clock.Real{})

	authenticator := auth.NewAuthenticator(tokenIssuer, sessionCache, identityModule.Service)

	eventBus := events.NewBus()
	wiring.RegisterNotificationBridge(eventBus, identityModule.Service, logger)
	schedulingModule := scheduling.Register(pool, eventBus, identityModule.Service)

	hub := realtime.NewHub(broadcasterFor(redisClient))

	// permits and attendance depend on each other only through adapters:
	// permits is built first with a late-bound attendance sync, then
	// attendance receives permits' blocker/overrider.
	sync := &lateBoundSync{}
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Bus: eventBus, Storage: storageClientFor(cfg, logger),
		Schedule: permitsScheduleLookup{schedules: schedulingModule.ScheduleReader, periods: academicModule.Service, years: schoolModule.Service},
		Sync:     sync,
		Clock:    clock.Real{}, Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
	})
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pool, Bus: eventBus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: identityModule.Service, Hub: hub,
		Blocker: permitsBlocker{svc: permitsModule.Service}, Overrider: permitsOverrider{svc: permitsModule.Service},
	})
	sync.inner = attendanceSyncAdapter{force: attendanceModule.Service.ForceStatus}

	gradingModule := grading.Register(grading.Dependencies{
		Pool: pool, Years: schoolModule.Service, Perms: identityModule.Service, Clock: clock.Real{},
	})
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pool, Years: schoolModule.Service, Docs: wiring.DisciplineDocuments{Permits: permitsModule.Service},
		Sealer: sealer, Bus: eventBus, Clock: clock.Real{},
	})

	// Background jobs: every module registers its workers on one River
	// client. With WORKER_INLINE the API process also runs them, so a small
	// school needs a single process; otherwise cmd/worker runs them and this
	// client only enqueues.
	jobInserter := &lateBoundJobs{}
	notificationsModule := notifications.Register(notifications.Dependencies{
		Pool: pool, Jobs: jobInserter, Realtime: hubRealtimePublisher{hub: hub},
		Contacts: identityContacts{svc: identityModule.Service}, Bus: eventBus, Clock: clock.Real{},
		Push: senders.Push, Email: senders.Email, WhatsApp: senders.WhatsApp,
	})
	announcementsModule := announcements.Register(announcements.Dependencies{
		Pool: pool, Notifier: wiring.AnnouncementNotifier{Svc: notificationsModule.Service}, Clock: clock.Real{}, Logger: logger,
	})

	var (
		workers  *river.Workers
		periodic []*river.PeriodicJob
	)
	if cfg.WorkerInline {
		workers = jobs.NewWorkers()
		periodic = append(periodic, permitsModule.RegisterJobs(workers, logger)...)
		notificationPeriodic, err := notificationsModule.RegisterJobs(workers)
		if err != nil {
			return nil, nil, err
		}
		periodic = append(periodic, notificationPeriodic...)
		periodic = append(periodic, announcementsModule.RegisterJobs(workers)...)
	}
	riverClient, err := jobs.NewClient(pool, workers, logger, periodic...)
	if err != nil {
		return nil, nil, err
	}
	jobInserter.client = riverClient
	bg := &background{jobs: riverClient, runWorkers: cfg.WorkerInline, logger: logger}

	reportsModule := reports.Register(reports.Dependencies{
		Attendance: wiring.AttendanceReports{Svc: attendanceModule.Service},
		Discipline: wiring.DisciplineReports{Svc: disciplineModule.Service, Directory: wiring.IdentityNames{Svc: identityModule.Service}},
		Grading:    wiring.GradingReports{Svc: gradingModule.Service},
		Permits:    wiring.PermitsReports{Svc: permitsModule.Service},
		Perms:      identityModule.Service,
	})

	doc, err := api.GetSpec()
	if err != nil {
		return nil, nil, err
	}
	ops, err := authz.LoadOperationPermissions(doc)
	if err != nil {
		return nil, nil, err
	}

	server := &combinedServer{
		Handler:              identityModule.Handler,
		TenantHandler:        schoolModule.Handler,
		SchedulingHandler:    schedulingModule.Handler,
		AttendanceHandler:    attendanceModule.Handler,
		AcademicHandler:      academicModule.Handler,
		PermitsHandler:       permitsModule.Handler,
		NotificationsHandler: notificationsModule.Handler,
		AnnouncementsHandler: announcementsModule.Handler,
		DisciplineHandler:    disciplineModule.Handler,
		GradingHandler:       gradingModule.Handler,
		ReportsHandler:       reportsModule.Handler,
		healthHandler:        &healthHandler{version: version, pool: pool, redis: redisClient},
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

	return router, bg, nil
}

// background owns the River client built by buildRouter. Start is a no-op
// for enqueue-only mode (WORKER_INLINE=false); Stop always closes cleanly.
type background struct {
	jobs       *river.Client[pgx.Tx]
	runWorkers bool
	logger     *slog.Logger
}

func (b *background) Start(ctx context.Context) error {
	if b == nil || !b.runWorkers {
		return nil
	}
	if err := b.jobs.Start(ctx); err != nil {
		return err
	}
	b.logger.Info("inline job workers started")
	return nil
}

func (b *background) Stop(ctx context.Context) error {
	if b == nil || !b.runWorkers {
		return nil
	}
	return b.jobs.Stop(ctx)
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
	ensureCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.EnsureBucket(ensureCtx); err != nil {
		// Production buckets are provisioned out of band; a missing bucket
		// surfaces on the first upload, not at boot.
		logger.Warn("S3 bucket not reachable; document storage may fail", "bucket", cfg.S3Bucket, "error", err)
	}
	return client
}

// lateBoundSync breaks the permits <-> attendance construction cycle.
type lateBoundSync struct{ inner permitsservice.AttendanceSync }

func (l *lateBoundSync) ForceStatus(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, reason string) error {
	if l.inner == nil {
		return nil
	}
	return l.inner.ForceStatus(ctx, tenantID, studentUserID, from, to, statusCode, reason)
}
