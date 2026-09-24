// Package reports wires the report centre: one catalogue, one export
// endpoint, data supplied by the owning modules through wiring adapters,
// plus scheduled exports that render and email the same reports on a
// recurring cadence.
package reports

import (
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/transport/http"
	transportjobs "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/transport/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool       *pgxpool.Pool
	Attendance service.AttendanceReader
	Discipline service.DisciplineReader
	Grading    service.GradingReader
	Permits    service.PermitsReader
	// Letterhead resolves a tenant's kop laporan and default signature
	// block for every rendered export; nil omits it from every document
	// (Run degrades gracefully, see LetterheadReader's doc comment).
	Letterhead service.LetterheadReader
	Perms      transporthttp.PermissionChecker
	// Emails validates that a schedule's recipients are tenant users; nil
	// disables that check (only wired this way in tests).
	Emails service.RecipientChecker
	// Storage renders and uploads scheduled exports; nil disables the
	// periodic job's RegisterJobs registration entirely.
	Storage service.ScheduleStorage
	Clock   clock.Clock
}

type Module struct {
	Service         *service.Service
	ScheduleService *service.ScheduleService
	Handler         *transporthttp.ReportsHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Attendance, deps.Discipline, deps.Grading, deps.Permits, deps.Letterhead)

	clk := deps.Clock
	if clk == nil {
		clk = clock.Real{}
	}
	scheduleRepo := repository.NewSchedule(deps.Pool)
	scheduleSvc := service.NewScheduleService(deps.Pool, scheduleRepo, svc, deps.Perms, deps.Emails, deps.Storage, clk)

	return &Module{
		Service:         svc,
		ScheduleService: scheduleSvc,
		Handler:         transporthttp.New(svc, scheduleSvc, deps.Perms),
	}
}

// RegisterJobs adds the hourly due-schedule worker and returns its
// periodic schedule. Storage must be configured (deps.Storage non-nil at
// Register time) for this to do anything useful; callers that skip it
// (e.g. a standalone process that never renders reports) simply never
// call RegisterJobs.
func (m *Module) RegisterJobs(workers *river.Workers, email transportjobs.EmailSender, logger *slog.Logger) []*river.PeriodicJob {
	return transportjobs.Register(workers, transportjobs.Dependencies{
		Schedules: m.ScheduleService, Email: email, Logger: logger,
	})
}
