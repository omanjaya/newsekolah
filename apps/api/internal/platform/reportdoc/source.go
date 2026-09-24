package reportdoc

import (
	"context"

	"github.com/google/uuid"
)

// LetterheadSource is implemented by whatever module owns a tenant's
// configured kop laporan (in this codebase, apps/api/internal/modules/school)
// and loads it for a given tenant: the letterhead (logo bytes, if any,
// plus text lines) and the report's default signature. reportdoc itself
// never reads a database (see the package doc comment); a caller that
// wants a tenant's own letterhead wires a narrow adapter satisfying this
// interface through apps/api/internal/wiring, the same cross-module
// pattern every other module uses (docs/03-layered-architecture.md
// section 1) -- for example:
//
//	type ReportHeaderReports struct{ Svc *schoolservice.Service }
//
//	func (r ReportHeaderReports) Letterhead(ctx context.Context, tenantID uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
//		return r.Svc.ReportLetterhead(ctx, tenantID)
//	}
//
// A nil Letterhead and/or nil Signature with a nil error means the
// tenant has not configured one (or configured it without a logo/without
// signers); callers should render without it rather than treat that as
// a failure.
type LetterheadSource interface {
	Letterhead(ctx context.Context, tenantID uuid.UUID) (*Letterhead, *Signature, error)
}
