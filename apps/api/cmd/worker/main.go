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
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

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

	sealer, err := crypto.NewSealer("v1", cfg.EncryptionSecret())
	if err != nil {
		return err
	}

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
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
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
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pool, Bus: eventBus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: identityModule.Service,
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
		Discipline: wiring.DisciplineReports{Svc: disciplineModule.Service, Directory: wiring.IdentityNames{Svc: identityModule.Service}},
		Grading:    wiring.GradingReports{Svc: gradingModule.Service},
		Permits:    wiring.PermitsReports{Svc: permitsModule.Service},
		Perms:      identityModule.Service,
		Emails:     identityModule.Service,
		Storage:    sharedStorage,
		Clock:      clock.Real{},
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
		APNSConfigured: cfg.APNSKeyP8 != "",
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
		Events: wiring.LibraryEvents{Bus: eventBus}, ScanTokens: wiring.LibraryScanTokens{Permits: permitsModule.Service},
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
