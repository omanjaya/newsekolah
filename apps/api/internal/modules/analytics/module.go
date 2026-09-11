// Package analytics wires the early-warning module: a per-student risk
// level composed from the attendance, discipline and grading modules'
// own read APIs, scored by a pure domain rule against a tenant policy,
// recomputed on a schedule by transport/jobs, and served to a homeroom
// teacher (own class only), a counselor, or school leadership.
package analytics

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool       *pgxpool.Pool
	Years      service.AcademicYearReader
	Attendance service.AttendanceReader
	Discipline service.DisciplineReader
	Grading    service.GradingReader
	// Identity and Permits back the admin dashboard (Dependencies.Presence
	// is optional; see service.PresenceReader's doc comment).
	Identity service.IdentityReader
	Permits  service.PermitsReader
	Presence service.PresenceReader
	Clock    clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.AnalyticsHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Attendance, deps.Discipline, deps.Grading,
		service.DashboardDeps{Identity: deps.Identity, Permits: deps.Permits, Presence: deps.Presence}, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
