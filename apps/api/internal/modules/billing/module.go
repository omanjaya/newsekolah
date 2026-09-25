// Package billing wires the billing module: the fee-type and discount
// catalog, idempotent bill generation, payments (partial payments,
// voiding, numbered receipts), and the arrears report. It never talks to
// a payment gateway; recording money someone already received by some
// other channel is the whole scope.
package billing

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool  *pgxpool.Pool
	Years service.AcademicYearReader
	Docs  service.ReceiptIssuer // nil: payments record but no receipt PDF is issued
	Flags service.FlagReader    // nil: billing is always enabled (feature_flags opt-out default)
	Clock clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.BillingHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Docs, deps.Flags, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
