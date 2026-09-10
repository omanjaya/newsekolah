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
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics"
	analyticsjobs "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/transport/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/family"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors"
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
		Pool:    pool,
		Years:   schoolModule.Service,
		Limiter: rateLimiter,
		Tokens:  tokenIssuer,
		Clock:   clock.Real{},
		Config: identityservice.Config{
			RefreshTokenTTL: cfg.RefreshTokenTTL,
			// RPID is the base domain rather than a single tenant's
			// subdomain so a passkey registered on one tenant's
			// subdomain still verifies there in multi-tenant mode; it
			// stays empty (passkeys off) when BASE_DOMAIN is not set,
			// same as single-tenant dev without it configured.
			PasskeyRPID:          cfg.BaseDomain,
			PasskeyRPOrigins:     cfg.AppOrigins,
			PasskeyRPDisplayName: "newsekolah",
		},
		Branding:     schoolModule.Handler,
		SessionCache: sessionCache,
		IsProduction: cfg.IsProduction(),
		Email:        senders.Email,
		MfaSealer:    sealer,
		Ceremony:     store,
	})

	academicModule := academic.Register(pool, clock.Real{})

	// The onboarding wizard (level templates, Dapodik import, sample-data
	// seeding) lives on schoolModule.Service but needs academic and
	// identity, both constructed after school (they in turn depend on
	// school for the active academic year) -- so it is wired here with a
	// setter instead of at school.Register time.
	schoolModule.Service.SetOnboardingDependencies(academicModule.Service, identityModule.Service, clock.Real{})

	authenticator := auth.NewAuthenticator(tokenIssuer, sessionCache, identityModule.Service)

	eventBus := events.NewBus()
	wiring.RegisterNotificationBridge(eventBus, identityModule.Service, logger)
	schedulingModule := scheduling.Register(pool, eventBus, identityModule.Service)

	hub := realtime.NewHub(broadcasterFor(redisClient))

	// permits and attendance depend on each other only through adapters:
	// permits is built first with a late-bound attendance sync, then
	// attendance receives permits' blocker/overrider.
	sharedStorage := storageClientFor(cfg, logger)

	sync := &lateBoundSync{}
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Bus: eventBus, Storage: sharedStorage,
		Schedule:  permitsScheduleLookup{schedules: schedulingModule.ScheduleReader, periods: academicModule.Service, years: schoolModule.Service},
		Sync:      sync,
		Guardians: wiring.GuardianLinks{Identity: identityModule.Service},
		Clock:     clock.Real{}, Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
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

	// analytics composes its risk signals through adapters over
	// attendance, discipline and grading's own services (never their
	// tables), so it is built after all three.
	analyticsModule := analytics.Register(analytics.Dependencies{
		Pool: pool, Years: schoolModule.Service,
		Attendance: wiring.AnalyticsAttendance{Svc: attendanceModule.Service},
		Discipline: wiring.AnalyticsDiscipline{Svc: disciplineModule.Service},
		Grading:    wiring.AnalyticsGrading{Svc: gradingModule.Service},
		Clock:      clock.Real{},
	})

	// Built before the jobs block below so its periodic due-schedule scan
	// can be registered alongside every other module's.
	reportsModule := reports.Register(reports.Dependencies{
		Pool:       pool,
		Attendance: wiring.AttendanceReports{Svc: attendanceModule.Service},
		Discipline: wiring.DisciplineReports{Svc: disciplineModule.Service, Directory: wiring.IdentityNames{Svc: identityModule.Service}},
		Grading:    wiring.GradingReports{Svc: gradingModule.Service},
		Permits:    wiring.PermitsReports{Svc: permitsModule.Service},
		Perms:      identityModule.Service,
		Emails:     identityModule.Service,
		Storage:    sharedStorage,
		Clock:      clock.Real{},
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
		Sealer: sealer, WhatsAppAppSecret: cfg.WhatsAppAppSecret, WhatsAppWebhookVerifyToken: cfg.WhatsAppWebhookVerifyToken,
	})
	announcementsModule := announcements.Register(announcements.Dependencies{
		Pool: pool, Notifier: wiring.AnnouncementNotifier{Svc: notificationsModule.Service}, Clock: clock.Real{}, Logger: logger,
	})
	integrationsModule := integrations.Register(integrations.Dependencies{
		Pool: pool, Bus: eventBus, Perms: identityModule.Service, Sealer: sealer, Jobs: jobInserter, Clock: clock.Real{}, Logger: logger,
	})
	// The key lookup path only exists once the integrations module is
	// built, so it is attached here rather than at NewAuthenticator time;
	// authenticator.Middleware reads it per-request, so ordering only
	// matters relative to the first served request, not to router.Use below.
	authenticator.WithAPIKeys(integrationsModule.Service, store)

	platformDeps := platform.Dependencies{
		Pool: pool, Admin: wiring.PlatformIdentity{Identity: identityModule.Service}, Jobs: jobInserter,
		Clock: clock.Real{}, Mode: cfg.TenancyMode, Bucket: cfg.S3Bucket,
	}
	if sharedStorage != nil {
		platformDeps.Storage = wiring.PlatformStorage{Client: sharedStorage}
	}
	platformModule := platform.Register(platformDeps)

	visitorsModule := visitors.Register(visitors.Dependencies{
		Pool: pool, Years: schoolModule.Service, Docs: wiring.VisitorsDocuments{Permits: permitsModule.Service},
		Flags: wiring.VisitorsFlags{Platform: platformModule.Service}, Audit: wiring.VisitorsAudit{}, Clock: clock.Real{},
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
		periodic = append(periodic, reportsModule.RegisterJobs(workers, wiring.ReportsEmailSender{Email: senders.Email}, logger)...)
		platformModule.RegisterJobs(workers)
		integrationsModule.RegisterJobs(workers, clock.Real{})
		// analyticsModule needs attendance/discipline/grading already
		// built, which cmd/worker does not construct today -- its
		// recompute job runs only in this inline (WORKER_INLINE=true)
		// path, the same single-process mode docs/12-roadmap.md expects
		// a small school to run.
		if err := analyticsjobs.Register(workers, analyticsModule.Service); err != nil {
			return nil, nil, err
		}
		periodic = append(periodic, analyticsjobs.PeriodicJobs()...)
	}
	riverClient, err := jobs.NewClient(pool, workers, logger, periodic...)
	if err != nil {
		return nil, nil, err
	}
	jobInserter.client = riverClient
	bg := &background{jobs: riverClient, runWorkers: cfg.WorkerInline, logger: logger}

	libraryModule := library.Register(library.Dependencies{
		Pool: pool, Members: wiring.LibraryMembers{Svc: identityModule.Service}, Clock: clock.Real{},
	})

	familyModule := family.Register(family.Dependencies{
		Links:      identityModule.Service,
		Attendance: wiring.FamilyAttendance{Svc: attendanceModule.Service},
		Grading:    wiring.FamilyGrading{Svc: gradingModule.Service},
		Discipline: wiring.FamilyDiscipline{Svc: disciplineModule.Service},
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
		FamilyHandler:        familyModule.Handler,
		PlatformHandler:      platformModule.Handler,
		LibraryHandler:       libraryModule.Handler,
		IntegrationsHandler:  integrationsModule.Handler,
		AnalyticsHandler:     analyticsModule.Handler,
		VisitorsHandler:      visitorsModule.Handler,
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
