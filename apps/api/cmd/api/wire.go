package main

import (
	"context"
	"fmt"
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
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics"
	analyticsjobs "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/transport/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/family"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision"
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

	// Built before schoolModule (branding logo/favicon upload needs it)
	// and reused by permits/attendance/... below. storageClientFor returns
	// the narrower permits-owned interface so permits/platform's own
	// `== nil` checks stay correct when S3 is not configured; school wants
	// the concrete type instead (DownloadBounded/RemoveObject/Bucket, none
	// of which that interface has), and a comma-ok type assertion recovers
	// it without breaking that nil-interface-vs-nil-pointer safety: when
	// sharedStorage is a genuinely nil interface the assertion still just
	// yields a nil *storage.Client, not a panic.
	sharedStorage := storageClientFor(cfg, logger)
	sharedStorageClient, _ := sharedStorage.(*storage.Client)

	schoolModule := school.Register(pool, mode, sharedStorageClient)
	senders := wiring.SendersFromConfig(cfg, logger)
	sealer, err := crypto.NewSealer("v1", cfg.EncryptionSecret())
	if err != nil {
		return nil, nil, err
	}
	// pushDevices is filled in once the notifications module exists below
	// (identity is built first); see its type's comment.
	pushDevices := &lateBoundPushDevices{}
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
		AppOrigins:   cfg.AppOrigins,
		PushDevices:  pushDevices,
		Email:        senders.Email,
		MfaSealer:    sealer,
		Ceremony:     store,
	})

	academicModule := academic.Register(pool, clock.Real{})
	academicModule.Service.SetLetterheadSource(wiring.ReportHeaderReports{Svc: schoolModule.Service})

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
	schedulingModule.Service.SetLetterheadSource(wiring.ReportHeaderReports{Svc: schoolModule.Service})

	hub := realtime.NewHub(broadcasterFor(redisClient))
	// presenceTTL mirrors the old system's presence.go (teacher_attendance
	// dashboard): a connection not heard from in 90s is presumed gone.
	const presenceTTL = 90 * time.Second
	presence := realtime.NewPresence(presenceStoreFor(redisClient), presenceTTL)

	// permits and attendance depend on each other only through adapters:
	// permits is built first with a late-bound attendance sync, then
	// attendance receives permits' blocker/overrider.
	sync := &lateBoundSync{}
	// discipline also depends on permits (DisciplineDocuments, below), so
	// its own RecordLateArrivalViolation adapter is late-bound the same
	// way sync is, breaking the two-way construction cycle.
	disc := &lateBoundDiscipline{}
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Bus: eventBus, Hub: hub, Storage: sharedStorage,
		Schedule:   permitsScheduleLookup{schedules: schedulingModule.ScheduleReader, periods: academicModule.Service, years: schoolModule.Service},
		Sync:       sync,
		Guardians:  wiring.GuardianLinks{Identity: identityModule.Service},
		Discipline: disc,
		Clock:      clock.Real{}, Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
	})
	lateViolations := &lateBoundViolations{}
	lateDiscipline := &lateBoundDisciplineReader{}
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pool, Bus: eventBus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: identityModule.Service, Hub: hub,
		Blocker: permitsBlocker{svc: permitsModule.Service}, Overrider: permitsOverrider{svc: permitsModule.Service},
		Violations: lateViolations, Discipline: lateDiscipline, Presence: presence,
		Letterheads: wiring.ReportHeaderReports{Svc: schoolModule.Service},
	})
	sync.inner = attendanceSyncAdapter{force: attendanceModule.Service.ForceStatus}

	staffAttendanceModule := staffattendance.Register(staffattendance.Dependencies{
		Pool: pool, Years: schoolModule.Service,
		Calendar:   wiring.StaffAttendanceCalendar{Academic: academicModule.Service},
		Leave:      wiring.StaffAttendanceLeave{Permits: permitsModule.Service},
		Letterhead: wiring.ReportHeaderReports{Svc: schoolModule.Service},
	})

	// grading's module flag is read through platformModule, which is not
	// built until after grading and several modules that depend on it
	// (below); gradingFlags is set once platformModule exists, the same
	// lateBoundSync trick permits/attendance already use to break a
	// construction-order cycle.
	gradingFlags := &lateBoundGradingFlags{}
	gradingModule := grading.Register(grading.Dependencies{
		Pool: pool, Years: schoolModule.Service, Perms: identityModule.Service, Flags: gradingFlags, Clock: clock.Real{},
	})
	gradingModule.Service.SetLetterheadSource(wiring.ReportHeaderReports{Svc: schoolModule.Service})
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pool, Years: schoolModule.Service, Docs: wiring.DisciplineDocuments{Permits: permitsModule.Service},
		Sealer: sealer, Bus: eventBus, Clock: clock.Real{},
		Names: wiring.IdentityNames{Svc: identityModule.Service}, Guardians: wiring.DisciplineGuardians{Identity: identityModule.Service},
		Storage: sharedStorage, Config: disciplineservice.DefaultConfig(cfg.S3Bucket),
	})
	disc.inner = wiring.LateArrivalDiscipline{Discipline: disciplineModule.Service, Clock: clock.Real{}}
	lateViolations.inner = disciplineViolationsAdapter{svc: disciplineModule.Service}
	lateDiscipline.inner = disciplineModule.Service

	// analytics composes its risk signals through adapters over
	// attendance, discipline and grading's own services (never their
	// tables), so it is built after all three.
	analyticsModule := analytics.Register(analytics.Dependencies{
		Pool: pool, Years: schoolModule.Service,
		Attendance: wiring.AnalyticsAttendance{Svc: attendanceModule.Service},
		Discipline: wiring.AnalyticsDiscipline{Svc: disciplineModule.Service},
		Grading:    wiring.AnalyticsGrading{Svc: gradingModule.Service},
		// Admin dashboard (identity/permits satisfy IdentityReader/
		// PermitsReader structurally/via a small adapter -- see
		// wiring/analytics.go). Presence reads the same tracker every
		// GET /ws/me connection heartbeats, keyed
		// "<tenantID>:<role>:<userID>" by wsMeHandler.
		Identity: identityModule.Service,
		Permits:  wiring.AnalyticsPermits{Svc: permitsModule.Service},
		Presence: wiring.AnalyticsPresence{Presence: presence},
		Clock:    clock.Real{},
	})

	// Built before the jobs block below so its periodic due-schedule scan
	// can be registered alongside every other module's.
	reportsModule := reports.Register(reports.Dependencies{
		Pool:       pool,
		Attendance: wiring.AttendanceReports{Svc: attendanceModule.Service},
		Discipline: wiring.DisciplineReports{
			Svc: disciplineModule.Service, Directory: wiring.IdentityNames{Svc: identityModule.Service},
			Academic: academicModule.Service, Years: schoolModule.Service,
		},
		Grading: wiring.GradingReports{
			Svc: gradingModule.Service, Academic: academicModule.Service, Years: schoolModule.Service,
			Directory: wiring.IdentityNames{Svc: identityModule.Service},
		},
		Permits: wiring.PermitsReports{
			Svc: permitsModule.Service, Academic: academicModule.Service, Years: schoolModule.Service,
			Directory: wiring.IdentityNames{Svc: identityModule.Service},
		},
		Perms:   identityModule.Service,
		Emails:  identityModule.Service,
		Storage: sharedStorage,
		Clock:   clock.Real{},
		// attendance.daily's reportdoc export: grade-level class
		// resolution and the tenant's kop laporan. The same source now
		// backs every migrated report kind's document, not just
		// attendance.daily.
		Academic:   wiring.AcademicReports{Academic: academicModule.Service, School: schoolModule.Service},
		Letterhead: wiring.ReportHeaderReports{Svc: schoolModule.Service},
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
		APNSConfigured: cfg.APNSKeyP8 != "",
	})
	pushDevices.svc = notificationsModule.Service
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
	gradingFlags.inner = wiring.GradingFlags{Platform: platformModule.Service}

	// Fase 6 modules (docs/12-roadmap.md): both gated by platform's
	// per-tenant feature flags through the wiring.PlatformFlags adapter,
	// so neither imports the platform module directly.
	mentoringModule := mentoring.Register(mentoring.Dependencies{
		Pool: pool, Years: schoolModule.Service,
		Attendance: wiring.MentoringAttendance{Svc: attendanceModule.Service},
		Discipline: wiring.MentoringDiscipline{Svc: disciplineModule.Service},
		Grading:    wiring.MentoringGrading{Svc: gradingModule.Service},
		Flags:      wiring.PlatformFlags{Svc: platformModule.Service},
		Sealer:     sealer, Clock: clock.Real{},
	})
	supervisionModule := supervision.Register(supervision.Dependencies{
		Pool: pool, Years: schoolModule.Service,
		Schedules:  wiring.SupervisionSchedule{Reader: schedulingModule.ScheduleReader},
		Flags:      wiring.PlatformFlags{Svc: platformModule.Service},
		Letterhead: wiring.ReportHeaderReports{Svc: schoolModule.Service},
		Clock:      clock.Real{},
	})
	visitorsModule := visitors.Register(visitors.Dependencies{
		Pool: pool, Years: schoolModule.Service, Docs: wiring.VisitorsDocuments{Permits: permitsModule.Service},
		Flags: wiring.VisitorsFlags{Platform: platformModule.Service}, Audit: wiring.VisitorsAudit{},
		Letterhead: wiring.ReportHeaderReports{Svc: schoolModule.Service}, Clock: clock.Real{},
	})
	billingModule := billing.Register(billing.Dependencies{
		Pool: pool, Years: schoolModule.Service, Docs: wiring.BillingDocuments{Permits: permitsModule.Service},
		Flags: wiring.BillingFlags{Platform: platformModule.Service}, Links: identityModule.Service, Clock: clock.Real{},
	})

	libraryModule := library.Register(library.Dependencies{
		Pool: pool, Members: wiring.LibraryMembers{Svc: identityModule.Service},
		Flags: wiring.LibraryFlags{Platform: platformModule.Service}, Permissions: wiring.LibraryPermissions{Identity: identityModule.Service},
		Events: wiring.LibraryEvents{Bus: eventBus}, ScanTokens: wiring.LibraryScanTokens{Permits: permitsModule.Service},
		Storage: sharedStorage, Bucket: cfg.S3Bucket,
		Letterhead: wiring.ReportHeaderReports{Svc: schoolModule.Service},
		Clock:      clock.Real{},
	})

	var (
		workers  *river.Workers
		periodic []*river.PeriodicJob
	)
	if cfg.WorkerInline {
		workers = jobs.NewWorkers()
		// cmd/worker registers its own copy of this job for the
		// WORKER_INLINE=false (split-deployment) case, since only that
		// process runs workers then; this call covers the single-process
		// deployment, where cmd/worker never starts.
		periodic = append(periodic, identityModule.RegisterJobs(workers, logger)...)
		periodic = append(periodic, permitsModule.RegisterJobs(workers, logger)...)
		notificationPeriodic, err := notificationsModule.RegisterJobs(workers)
		if err != nil {
			return nil, nil, err
		}
		periodic = append(periodic, notificationPeriodic...)
		periodic = append(periodic, announcementsModule.RegisterJobs(workers)...)
		periodic = append(periodic, reportsModule.RegisterJobs(workers, wiring.ReportsEmailSender{Email: senders.Email}, logger)...)
		periodic = append(periodic, libraryModule.RegisterJobs(workers, logger)...)
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

	familyModule := family.Register(family.Dependencies{
		Links:         identityModule.Service,
		Attendance:    wiring.FamilyAttendance{Svc: attendanceModule.Service},
		Grading:       wiring.FamilyGrading{Svc: gradingModule.Service},
		Subjects:      wiring.FamilySubjects{Svc: academicModule.Service},
		Discipline:    wiring.FamilyDiscipline{Svc: disciplineModule.Service},
		LeaveRequests: wiring.FamilyLeaveRequests{Svc: permitsModule.Service},
	})

	activitiesModule := activities.Register(activities.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
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
		Handler:                identityModule.Handler,
		TenantHandler:          schoolModule.Handler,
		SchedulingHandler:      schedulingModule.Handler,
		AttendanceHandler:      attendanceModule.Handler,
		AcademicHandler:        academicModule.Handler,
		PermitsHandler:         permitsModule.Handler,
		NotificationsHandler:   notificationsModule.Handler,
		AnnouncementsHandler:   announcementsModule.Handler,
		DisciplineHandler:      disciplineModule.Handler,
		GradingHandler:         gradingModule.Handler,
		ReportsHandler:         reportsModule.Handler,
		FamilyHandler:          familyModule.Handler,
		PlatformHandler:        platformModule.Handler,
		LibraryHandler:         libraryModule.Handler,
		IntegrationsHandler:    integrationsModule.Handler,
		AnalyticsHandler:       analyticsModule.Handler,
		ActivitiesHandler:      activitiesModule.Handler,
		MentoringHandler:       mentoringModule.Handler,
		SupervisionHandler:     supervisionModule.Handler,
		StaffAttendanceHandler: staffAttendanceModule.Handler,
		VisitorsHandler:        visitorsModule.Handler,
		BillingHandler:         billingModule.Handler,
		healthHandler:          &healthHandler{version: version, pool: pool, redis: redisClient},
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
	router.Use(impersonationActionLogger(identityModule.Service))

	api.HandlerFromMux(strict, router)

	// Mounted after HandlerFromMux so these two routes replace its
	// generated GET /ws/me and GET /ws/monitor stubs (backed by
	// attendance's honest-501 strict handler) with the real WebSocket
	// upgrade -- see the doc comment on mountRealtimeRoutes in ws.go for
	// why a strict handler can never serve these itself. hub is the same
	// instance passed into attendance.Register above, so a socket opened
	// here is visible to the attendance module's monitor presence count.
	mountRealtimeRoutes(router, pool, tokenIssuer, identityModule.Service, hub, presence, attendanceModule.Service, cfg.AppOrigins, logger)

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

// presenceStoreFor is broadcasterFor's counterpart for presence: nil in
// single-instance mode (REDIS_URL unset), where realtime.Presence keeps its
// heartbeats in-memory only.
func presenceStoreFor(redisClient *redis.Client) realtime.PresenceStore {
	if redisClient == nil {
		return nil
	}
	return realtime.NewRedisPresenceStore(redisClient, "presence:ws-me")
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

// impersonationActionLogger records every request made under an
// impersonation session (docs/analysis/backend-inventory.md section 1.2:
// impersonation_actions). It runs after the handler, in its own goroutine
// and its own background context, so a slow or failing audit write never
// adds latency to -- or ever fails -- the request it is describing.
func impersonationActionLogger(svc *identityservice.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)

			ctx := r.Context()
			if _, impersonating := httpx.ActorIDFromContext(ctx); !impersonating {
				return
			}
			tenantID, ok := httpx.TenantIDFromContext(ctx)
			if !ok {
				return
			}
			sessionID, ok := httpx.SessionIDFromContext(ctx)
			if !ok {
				return
			}
			ip := httpx.RequestMetaFromContext(ctx).IP
			method, path := r.Method, r.URL.Path
			// #nosec G118 -- background context is intentional, per this function's own doc comment: it must outlive the request it describes
			go svc.RecordImpersonationAction(context.Background(), tenantID, sessionID, method, path, ip) //nolint:gosec // background context is intentional, per this function's own doc comment: it must outlive the request it describes
		})
	}
}

// lateBoundSync breaks the permits <-> attendance construction cycle.
type lateBoundSync struct{ inner permitsservice.AttendanceSync }

func (l *lateBoundSync) ForceStatus(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, reason string) error {
	if l.inner == nil {
		return nil
	}
	return l.inner.ForceStatus(ctx, tenantID, studentUserID, from, to, statusCode, reason)
}

// lateBoundGradingFlags breaks the grading <-> platform construction
// order: grading is registered before platformModule exists, but only
// platformModule can answer IsModuleEnabled. Before inner is set (i.e.
// before the server ever handles a request), grading reads as enabled --
// the same fail-open default lateBoundSync uses for ForceStatus.
type lateBoundGradingFlags struct{ inner gradingservice.FlagReader }

func (l *lateBoundGradingFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	if l.inner == nil {
		return true, nil
	}
	return l.inner.IsModuleEnabled(ctx, tenantID)
}

// lateBoundDiscipline breaks the permits <-> discipline construction cycle
// the same way lateBoundSync does for permits <-> attendance: discipline
// needs permitsModule.Service (DisciplineDocuments) to issue warning
// letters, and permits needs disciplineModule.Service to record a late
// arrival's reviewed violations.
type lateBoundDiscipline struct {
	inner permitsservice.DisciplineRecorder
}

func (l *lateBoundDiscipline) RecordLateArrivalViolation(ctx context.Context, tenantID, studentUserID, violationTypeID, workflowInstanceID, reporterUserID uuid.UUID, note string) error {
	if l.inner == nil {
		return fmt.Errorf("%w: discipline module is not wired yet", permitsdomain.ErrViolationInvalid)
	}
	return l.inner.RecordLateArrivalViolation(ctx, tenantID, studentUserID, violationTypeID, workflowInstanceID, reporterUserID, note)
}

// lateBoundViolations breaks the attendance <-> discipline construction
// cycle: attendance is built before discipline, so it receives this and
// discipline.Register's real adapter is attached to inner afterwards.
type lateBoundViolations struct{ inner attendance.ViolationRecorder }

func (l *lateBoundViolations) ReplaceSessionViolations(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID, violationTypeIDs []uuid.UUID, occurredOn time.Time, reporterUserID uuid.UUID) error {
	if l.inner == nil {
		return nil
	}
	return l.inner.ReplaceSessionViolations(ctx, tenantID, sessionID, studentUserID, violationTypeIDs, occurredOn, reporterUserID)
}

// lateBoundDisciplineReader breaks the same attendance <-> discipline
// construction cycle for the homeroom roster's violation summary. inner is
// the concrete discipline service rather than attendance.DisciplineReader
// so ViolationSummaryForClass can be built here, over discipline's
// existing PointTotals, without the discipline module needing a batch
// query of its own -- discipline's repository has no
// ListPointTotalsForStudents(student_user_id = any($n)) query, only the
// per-class ListStudentPointTotals PointTotals already uses, but a
// homeroom roster is always exactly one class, so scoping by classID
// instead of by student ID list gets the same one-query result.
type lateBoundDisciplineReader struct{ inner *disciplineservice.Service }

func (l *lateBoundDisciplineReader) ViolationSummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (int, int, error) {
	if l.inner == nil {
		return 0, 0, nil
	}
	return l.inner.ViolationSummary(ctx, tenantID, academicYearID, studentUserID)
}

// homeroomClassPointTotalsLimit is passed to PointTotals in place of a
// per-student ID list: it must cover every student a homeroom class can
// hold, which is always far below PointTotals' own cap of 500.
const homeroomClassPointTotalsLimit = 500

func (l *lateBoundDisciplineReader) ViolationSummaryForClass(ctx context.Context, tenantID, classID uuid.UUID) (map[uuid.UUID]attendance.ViolationSummary, error) {
	if l.inner == nil {
		return nil, nil
	}
	totals, err := l.inner.PointTotals(ctx, tenantID, uuid.NullUUID{UUID: classID, Valid: true}, homeroomClassPointTotalsLimit)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]attendance.ViolationSummary, len(totals))
	for _, t := range totals {
		out[t.StudentUserID] = attendance.ViolationSummary{Count: t.RecordCount, Points: t.Total}
	}
	return out, nil
}
