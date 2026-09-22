// Command worker runs the River job queue. Phase 0 registers no job kinds
// yet (no module publishes one), so this idles ready for the notify/jobs
// work later phases add; it still exercises the same River schema and
// connection wiring cmd/api and cmd/migrate use.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
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

	if err := database.EnsureLeastPrivilege(ctx, pool, cfg.AppEnv); err != nil {
		return err
	}

	workers := jobs.NewWorkers()
	schoolModule := school.Register(pool, tenantModeFor(cfg), nil)
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
	})
	periodic := permitsModule.RegisterJobs(workers, logger)

	senders := wiring.SendersFromConfig(cfg, logger)
	sealer, err := crypto.NewSealer("v1", cfg.EncryptionSecret())
	if err != nil {
		return err
	}
	notificationsModule := notifications.Register(notifications.Dependencies{
		Pool: pool, Jobs: nil, Clock: clock.Real{},
		Push: senders.Push, Email: senders.Email, WhatsApp: senders.WhatsApp,
		Sealer: sealer, WhatsAppAppSecret: cfg.WhatsAppAppSecret, WhatsAppWebhookVerifyToken: cfg.WhatsAppWebhookVerifyToken,
		APNSConfigured: cfg.APNSKeyP8 != "",
	})
	notificationPeriodic, err := notificationsModule.RegisterJobs(workers)
	if err != nil {
		return err
	}
	periodic = append(periodic, notificationPeriodic...)
	announcementsModule := announcements.Register(announcements.Dependencies{
		Pool: pool, Notifier: wiring.AnnouncementNotifier{Svc: notificationsModule.Service}, Clock: clock.Real{}, Logger: logger,
	})
	periodic = append(periodic, announcementsModule.RegisterJobs(workers)...)

	// Perms is nil: this process only works the delivery job, it never
	// serves CreateAPIKey (the only use case that consults it), so there is
	// no PermissionsProvider to build here without pulling in the whole
	// identity module for a call path that never runs.
	integrationsModule := integrations.Register(integrations.Dependencies{
		Pool: pool, Perms: nil, Sealer: sealer, Jobs: nil, Clock: clock.Real{}, Logger: logger,
	})
	integrationsModule.RegisterJobs(workers, clock.Real{})

	// Only PruneSessions is exercised here (it touches nothing but the
	// repository), so every other dependency -- login, MFA, SSO, passkeys --
	// is left nil rather than pulling in schoolModule and the rest of what
	// cmd/api wires up for a call path this process never serves.
	identityModule := identity.Register(identity.Dependencies{Pool: pool, Clock: clock.Real{}})
	periodic = append(periodic, identityModule.RegisterJobs(workers, logger)...)

	// The export job has no dependency on identity: RunExport only reads
	// tenant tables and writes to object storage, so this process never
	// needs an IdentityProvisioner (only cmd/api's synchronous
	// CreatePlatformTenant call does).
	platformDeps := platform.Dependencies{Pool: pool, Clock: clock.Real{}, Mode: cfg.TenancyMode, Bucket: cfg.S3Bucket}
	if s3 := workerStorageClientFor(cfg, logger); s3 != nil {
		platformDeps.Storage = wiring.PlatformStorage{Client: s3}
	}
	platformModule := platform.Register(platformDeps)
	platformModule.RegisterJobs(workers)

	client, err := jobs.NewClient(pool, workers, logger, periodic...)
	if err != nil {
		return err
	}

	if err := client.Start(ctx); err != nil {
		return err
	}
	logger.Info("worker started")

	<-ctx.Done()
	logger.Info("worker stopping")
	return client.Stop(context.Background())
}

// workerStorageClientFor mirrors cmd/api/wire.go's storageClientFor: a dev
// box without S3 configured just runs with exports disabled instead of
// failing to start.
func workerStorageClientFor(cfg config.Config, logger *slog.Logger) permitsservice.Storage {
	if cfg.S3Endpoint == "" || cfg.S3Bucket == "" {
		logger.Warn("S3 not configured; tenant exports disabled")
		return nil
	}
	client, err := storage.NewClient(storage.Config{
		Endpoint: cfg.S3Endpoint, Bucket: cfg.S3Bucket, AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey, UseSSL: cfg.S3UseSSL,
	})
	if err != nil {
		logger.Warn("S3 client init failed; tenant exports disabled", "error", err)
		return nil
	}
	ensureCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.EnsureBucket(ensureCtx); err != nil {
		logger.Warn("S3 bucket not reachable; tenant exports may fail", "bucket", cfg.S3Bucket, "error", err)
	}
	return client
}

func tenantModeFor(cfg config.Config) tenant.Mode {
	if cfg.TenancyMode == config.TenancyMulti {
		return tenant.ModeMulti
	}
	return tenant.ModeSingle
}
