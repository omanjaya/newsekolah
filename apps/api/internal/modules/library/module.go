// Package library wires the library module: title and copy catalogue,
// circulation (borrow, return, renew, fines), the reservation queue,
// stocktake sessions, the public OPAC, and circulation reports.
package library

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool     *pgxpool.Pool
	Members  service.MemberDirectory // nil: reports and cards fall back to the member's user ID
	Settings service.SettingsReader  // nil: accession numbers and barcodes use service.DefaultSettings
	Clock    clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.LibraryHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Members, deps.Settings, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
