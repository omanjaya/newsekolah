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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Dependencies struct {
	Pool      *pgxpool.Pool
	Years     service.AcademicYearReader
	Schedules service.ScheduleReader
	Flags     service.FlagChecker
	// Letterhead loads a tenant's configured kop laporan for the teacher
	// report export; nil is fine (that export just never shows one).
	Letterhead reportdoc.LetterheadSource
	Clock      clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.SupervisionHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Schedules, deps.Flags, deps.Letterhead, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
