// Package visitors wires the visitors module: guests at the gate (expected
// list, the board, sign-in and sign-out with a printed badge) and campus
// incidents with a restricted, audited read.
package visitors

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Dependencies struct {
	Pool  *pgxpool.Pool
	Years service.AcademicYearReader
	Docs  service.DocumentIssuer // nil: badges are numbered locally without a PDF
	Flags service.FlagReader
	Audit service.AuditRecorder
	// Letterhead loads a tenant's configured kop laporan for the daily/
	// monthly recap exports; nil is fine (those exports just never show
	// one).
	Letterhead reportdoc.LetterheadSource
	Clock      clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.VisitorsHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Docs, deps.Flags, deps.Audit, deps.Letterhead, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
