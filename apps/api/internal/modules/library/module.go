// Package library wires the library module: title and copy catalogue,
// circulation (borrow, return, renew, fines, violations), members and
// member types, the reservation queue and its expiry job, stocktake
// sessions, visits and the guest-book kiosk, the public OPAC, and
// circulation reports.
package library

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Dependencies struct {
	Pool        *pgxpool.Pool
	Members     service.MemberDirectory // nil: reports and cards fall back to the member's user ID
	Settings    service.SettingsReader  // nil: accession numbers and barcodes use service.DefaultSettings
	Flags       service.FlagReader      // nil: module gate never blocks (used by tests)
	Permissions service.PermissionChecker
	Events      service.EventPublisher
	ScanTokens  service.ScanTokens // nil: kiosk token endpoints return an error
	Storage     service.Storage    // nil: downloading a cover from an external URL is disabled
	Bucket      string             // object storage bucket a downloaded cover is written to
	// Letterhead loads a tenant's configured kop laporan for the report
	// exports built on reportdoc; nil is fine (those exports just never
	// show one).
	Letterhead reportdoc.LetterheadSource
	Clock      clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.LibraryHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Members, deps.Settings, deps.Clock, service.Deps{
		Flags: deps.Flags, Permissions: deps.Permissions, Events: deps.Events, ScanTokens: deps.ScanTokens,
		Storage: deps.Storage, StorageBucket: deps.Bucket, Letterhead: deps.Letterhead,
	})
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
