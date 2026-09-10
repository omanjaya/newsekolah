// Package supervision wires the supervision module: a cycle's instrument,
// scheduled observations resolved through scheduling, completed
// observations scored against the instrument's scale, and per-teacher
// reports exported to XLSX.
package supervision

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool      *pgxpool.Pool
	Years     service.AcademicYearReader
	Schedules service.ScheduleReader
	Flags     service.FlagChecker
	Clock     clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.SupervisionHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Schedules, deps.Flags, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
