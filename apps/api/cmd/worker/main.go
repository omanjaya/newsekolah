// Command worker runs the River job queue for a split deployment
// (WORKER_INLINE=false on cmd/api): every module that registers a
// periodic or on-demand job here is wired the same way cmd/api wires it
// for its own inline WORKER_INLINE=true path, so a school running the
// split deployment gets the same background behaviour -- scheduled
// report exports, library reservation expiry and due reminders,
// notification delivery, session pruning, tenant exports -- as one
// running the single-process deployment. A school picks exactly one of
// the two: cmd/api with WORKER_INLINE=true and no separate worker
// process, or cmd/api with WORKER_INLINE=false plus this process, so
// registering unconditionally here never duplicates the other process's
// registration.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	notificationsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

func main() {
	logger := telemetry.NewLogger()
	if err := run(logger); err != nil {
		logger.Error("worker failed", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := database.EnsureLeastPrivilege(ctx, pool, cfg.AppEnv); err != nil {
		return err
	}

	sealer, err := crypto.NewSealer("v1", cfg.EncryptionSecret())
	if err != nil {
		return err
	}

	// redisClient backs a publish-only realtime.Hub: this process never
	// serves a WebSocket (no mountRealtimeRoutes, no Upgrade -- that is
	// cmd/api's job), so hub.Subscribe/watchRemote are simply never
	// called here and h.topics stays empty for the process's whole life.
	// hub.Publish still reaches every cmd/api replica's own Hub over the
	// same Redis channel cmd/api's hub uses (broadcasterFor's "realtime:"
	// prefix, see platform/realtime/redis.go), so a notification a
	// background job creates here (library due reminders, a scheduled
	// report's "ready" notification, any module's realtime Publish) is
	// pushed live to a connected /ws/me client instead of only landing in
	// the inbox until the next page load -- the gap WORKER_INLINE=false
	// had before this hub existed: this process built every module below
	// with no Hub/Realtime dependency at all, so River kept those
	// publishes silently dropped regardless of who was online. With
	// REDIS_URL unset, newWorkerRedisClient returns nil and hub.Publish
	// degrades to its own no-op (no broadcaster, no local subscribers).
	redisClient := newWorkerRedisClient(cfg.RedisURL, logger)
	if redisClient != nil {
		defer func() { _ = redisClient.Close() }()
	}
	hub := realtime.NewHub(workerBroadcasterFor(redisClient))

	workers := jobs.NewWorkers()
	eventBus := events.NewBus()
	sharedStorage := workerStorageClientFor(cfg, logger)
	schoolModule := school.Register(pool, tenantModeFor(cfg), nil)

	// identityModule backs every read-only lookup the modules below need
	// (permission checks, user directory, contact info for email/WhatsApp
	// delivery) plus its own PruneSessions job; the write-path-only
	// dependencies cmd/api wires (rate limiter, token issuer, session
	// cache, passkeys, SSO) are left nil because this process never
	// serves a login request.
	identityModule := identity.Register(identity.Dependencies{Pool: pool, Clock: clock.Real{}})

	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}, Hub: hub,
		Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
	})
	periodic := permitsModule.RegisterJobs(workers, logger)

	// schedulingModule, attendanceModule, disciplineModule and
	// gradingModule are built only far enough to back reports' read-only
	// export adapters (wiring.AttendanceReports/DisciplineReports/
	// GradingReports): the interactive dependencies cmd/api wires (Hub,
	// Presence, late-arrival blockers, counseling storage/letters) are
	// left nil since this process never serves those flows, only the
	// hourly scheduled-export job.
	schedulingModule := scheduling.Register(pool, eventBus, identityModule.Service)
	// academicModule backs the grade-level scope of reports' Discipline/
	// Grading/Permits export adapters below (resolving a grade level's
	// classes); this process never serves academic's own CRUD endpoints.
	academicModule := academic.Register(pool, clock.Real{})
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pool, Bus: eventBus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: identityModule.Service, Hub: hub,
	})
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pool, Years: schoolModule.Service, Sealer: sealer, Clock: clock.Real{},
		Names: wiring.IdentityNames{Svc: identityModule.Service}, Config: disciplineservice.DefaultConfig(cfg.S3Bucket),
	})
	gradingModule := grading.Register(grading.Dependencies{
		Pool: pool, Years: schoolModule.Service, Perms: identityModule.Service, Clock: clock.Real{},
	})

	// platformModule is built before grading/library's own flag checks
	// below (unlike cmd/api, nothing here depends on grading/library, so
	// no late-binding is needed) and, per platform's own Dependencies
	// doc comment, leaves Admin nil: this process never calls
	// CreateTenant, only the export worker cmd/api's RequestExport
	// enqueues.
	platformDeps := platform.Dependencies{Pool: pool, Clock: clock.Real{}, Mode: cfg.TenancyMode, Bucket: cfg.S3Bucket}
	if sharedStorage != nil {
		platformDeps.Storage = wiring.PlatformStorage{Client: sharedStorage}
	}
	platformModule := platform.Register(platformDeps)

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
		// Scheduled runs (RunDueSchedules) render through the same
		// RunDocument path as an interactive export, so they need the
		// same grade-level class resolution and tenant kop laporan.
		Academic:   wiring.AcademicReports{Academic: academicModule.Service, School: schoolModule.Service},
		Letterhead: wiring.ReportHeaderReports{Svc: schoolModule.Service},
	})

	senders := wiring.SendersFromConfig(cfg, logger)

	// jobInserter is filled in once the River client exists below, the
	// same construction-order workaround cmd/api uses: notificationsModule
	// needs it to enqueue delivery jobs from inside the event handlers
	// RegisterEventHandlers subscribes (library's due-reminder and
	// reservation-ready events), and those handlers must be registered
	// before jobs.NewClient's periodic schedule is built.
	jobInserter := &lateBoundJobs{}
	notificationsModule := notifications.Register(notifications.Dependencies{
		Pool: pool, Jobs: jobInserter, Contacts: identityContacts{svc: identityModule.Service}, Bus: eventBus, Clock: clock.Real{},
		Push: senders.Push, Email: senders.Email, WhatsApp: senders.WhatsApp,
		Sealer: sealer, WhatsAppAppSecret: cfg.WhatsAppAppSecret, WhatsAppWebhookVerifyToken: cfg.WhatsAppWebhookVerifyToken,
		APNSConfigured: cfg.APNSKeyP8 != "", Realtime: hubRealtimePublisher{hub: hub},
	})
	// Bridges library's LoanDueReminderEvent/ReservationReadyEvent (and
	// every other module's domain events) into the events.Envelope shape
	// notificationsModule's own subscriber above expects; without this,
	// library.Dependencies.Events below would publish events nothing
	// turns into an actual notification.
	wiring.RegisterNotificationBridge(eventBus, identityModule.Service, logger)
	notificationPeriodic, err := notificationsModule.RegisterJobs(workers)
	if err != nil {
		return err
	}
	periodic = append(periodic, notificationPeriodic...)

	libraryModule := library.Register(library.Dependencies{
		Pool: pool, Members: wiring.LibraryMembers{Svc: identityModule.Service},
		Flags: wiring.LibraryFlags{Platform: platformModule.Service}, Permissions: wiring.LibraryPermissions{Identity: identityModule.Service},
		Events: wiring.LibraryEvents{Bus: eventBus}, Hub: hub, ScanTokens: wiring.LibraryScanTokens{Permits: permitsModule.Service},
		Storage: sharedStorage, Bucket: cfg.S3Bucket, Clock: clock.Real{},
	})

	announcementsModule := announcements.Register(announcements.Dependencies{
		Pool: pool, Notifier: wiring.AnnouncementNotifier{Svc: notificationsModule.Service}, Clock: clock.Real{}, Logger: logger,
	})

	// Perms is nil: this process only works the delivery job, it never
	// serves CreateAPIKey (the only use case that consults it), so there is
	// no PermissionsProvider to build here without pulling in the whole
	// identity module for a call path that never runs.
	integrationsModule := integrations.Register(integrations.Dependencies{
		Pool: pool, Perms: nil, Sealer: sealer, Jobs: nil, Clock: clock.Real{}, Logger: logger,
	})
	integrationsModule.RegisterJobs(workers, clock.Real{})

	periodic = append(periodic, identityModule.RegisterJobs(workers, logger)...)
	periodic = append(periodic, announcementsModule.RegisterJobs(workers)...)
	periodic = append(periodic, reportsModule.RegisterJobs(workers, wiring.ReportsEmailSender{Email: senders.Email}, logger)...)
	periodic = append(periodic, libraryModule.RegisterJobs(workers, logger)...)
	platformModule.RegisterJobs(workers)

	client, err := jobs.NewClient(pool, workers, logger, periodic...)
	if err != nil {
		return err
	}
	jobInserter.client = client

	if err := client.Start(ctx); err != nil {
		return err
	}
	logger.Info("worker started")

	<-ctx.Done()
	logger.Info("worker stopping")
	return client.Stop(context.Background())
}

// identityContacts resolves the email and phone the email/WhatsApp
// notification channels deliver to, through identity's own service --
// mirrors cmd/api/integrations.go's identityContacts (unexported there,
// so duplicated rather than shared across two package main).
type identityContacts struct{ svc *identityservice.Service }

func (c identityContacts) EmailForUser(ctx context.Context, tenantID, userID uuid.UUID) (string, bool, error) {
	view, err := c.svc.GetUser(ctx, tenantID, userID)
	if err != nil {
		return "", false, err
	}
	return view.Email, view.Email != "", nil
}

func (c identityContacts) PhoneNumberForUser(ctx context.Context, tenantID, userID uuid.UUID) (string, bool, error) {
	view, err := c.svc.GetUser(ctx, tenantID, userID)
	if err != nil {
		return "", false, err
	}
	return view.Phone, view.Phone != "", nil
}

// errJobsNotReady guards lateBoundJobs.InsertTx against a call arriving
// before jobInserter.client is set in run below; it should never
// surface, since every caller of InsertTx runs only after the River
// client is started.
var errJobsNotReady = errors.New("jobs: river client not initialised")

// lateBoundJobs lets notificationsModule be constructed before the River
// client, whose periodic-job list depends on every module's workers --
// mirrors cmd/api/integrations.go's lateBoundJobs.
type lateBoundJobs struct{ client *river.Client[pgx.Tx] }

func (l *lateBoundJobs) InsertTx(ctx context.Context, tx pgx.Tx, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	if l.client == nil {
		return nil, errJobsNotReady
	}
	return l.client.InsertTx(ctx, tx, args, opts)
}

// workerStorageClientFor mirrors cmd/api/wire.go's storageClientFor: a dev
// box without S3 configured just runs with exports disabled instead of
// failing to start.
func workerStorageClientFor(cfg config.Config, logger *slog.Logger) *storage.Client {
	if cfg.S3Endpoint == "" || cfg.S3Bucket == "" {
		logger.Warn("S3 not configured; tenant exports and scheduled reports disabled")
		return nil
	}
	client, err := storage.NewClient(storage.Config{
		Endpoint: cfg.S3Endpoint, Bucket: cfg.S3Bucket, AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey, UseSSL: cfg.S3UseSSL,
		PublicEndpoint: cfg.S3PublicEndpoint, Region: cfg.S3Region,
	})
	if err != nil {
		logger.Warn("S3 client init failed; tenant exports and scheduled reports disabled", "error", err)
		return nil
	}
	ensureCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.EnsureBucket(ensureCtx); err != nil {
		logger.Warn("S3 bucket not reachable; tenant exports and scheduled reports may fail", "bucket", cfg.S3Bucket, "error", err)
	}
	return client
}

func tenantModeFor(cfg config.Config) tenant.Mode {
	if cfg.TenancyMode == config.TenancyMulti {
		return tenant.ModeMulti
	}
	return tenant.ModeSingle
}

// hubRealtimePublisher pushes "notification_created" events to the
// recipient's own WebSocket topic (see cmd/api/ws.go for the topic
// convention) -- mirrors cmd/api/integrations.go's hubRealtimePublisher
// (unexported there, so duplicated rather than shared across two package
// main, the same call this file makes for identityContacts/lateBoundJobs
// above). tenantID/userID come from notifications/service.Notify's own
// parameters, not ctx: a background job's ctx never carries the
// httpx-resolved tenant an HTTP request's would.
type hubRealtimePublisher struct{ hub *realtime.Hub }

func (p hubRealtimePublisher) Publish(_ context.Context, tenantID, userID uuid.UUID, event notificationsservice.RealtimeEvent) error {
	return p.hub.Publish("user:"+tenantID.String()+":"+userID.String(), map[string]any{"type": event.Type, "payload": event.Payload})
}

// workerBroadcasterFor mirrors cmd/api/wire.go's broadcasterFor: a nil
// Redis client (REDIS_URL unset) keeps the worker's Hub in single-process,
// publish-nowhere mode -- Publish then only ever calls deliverLocal, which
// is always a no-op here since nothing in this process ever Subscribes.
func workerBroadcasterFor(redisClient *redis.Client) realtime.Broadcaster {
	if redisClient == nil {
		return nil
	}
	return realtime.NewRedisBroadcaster(redisClient)
}

// newWorkerRedisClient mirrors cmd/api/wire.go's newRedisClient.
func newWorkerRedisClient(redisURL string, logger *slog.Logger) *redis.Client {
	if redisURL == "" {
		logger.Warn("REDIS_URL empty; realtime pushes from background jobs are disabled (single-instance only)")
		return nil
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		logger.Warn("invalid REDIS_URL, realtime pushes from background jobs are disabled", "error", err)
		return nil
	}
	return redis.NewClient(opts)
}
