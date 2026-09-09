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

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/jobs"
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

	workers := jobs.NewWorkers()
	schoolModule := school.Register(pool, tenantModeFor(cfg))
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte(cfg.DocumentSigningKey), cfg.S3Bucket), Logger: logger,
	})
	periodic := permitsModule.RegisterJobs(workers, logger)

	senders := wiring.SendersFromConfig(cfg, logger)
	notificationsModule := notifications.Register(notifications.Dependencies{
		Pool: pool, Jobs: nil, Clock: clock.Real{},
		Push: senders.Push, Email: senders.Email, WhatsApp: senders.WhatsApp,
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

func tenantModeFor(cfg config.Config) tenant.Mode {
	if cfg.TenancyMode == config.TenancyMulti {
		return tenant.ModeMulti
	}
	return tenant.ModeSingle
}
