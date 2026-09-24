// Package service implements the academic module's use cases: academic
// year/term/calendar management, grade structure, classes and enrollments
// (including promotion and Excel import), subjects/rooms, period
// templates, and teaching assignments. It orchestrates domain rules and the
// Repository interface; no SQL and no HTTP concerns live here, per
// docs/03-layered-architecture.md section 1.
package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// Repository is the academic module's data-access boundary, composed from
// one interface per area (declared alongside the service methods that use
// it) so no single file has to hold every method academic needs.
type Repository interface {
	yearRepository
	gradeRepository
	classRepository
	studentLookupRepository
	subjectRepository
	periodRepository
	teachingRepository
	policyRepository
	rosterExportRepository
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	clock clock.Clock
	// letterheads is optional (set via SetLetterheadSource after
	// construction, mirroring attendance/scheduling/grading's identically
	// named setter): nil means the class roster export renders without a
	// tenant letterhead.
	letterheads reportdoc.LetterheadSource
}

func New(pool *pgxpool.Pool, repo Repository, clk clock.Clock) *Service {
	return &Service{pool: pool, repo: repo, clock: clk}
}

// withTx opens the tenant-scoped transaction for one use case, per
// docs/03-layered-architecture.md section 2: the service is what calls
// database.WithTenantTx, not the transport handler, so app.tenant_id is
// never set (or forgotten) anywhere else.
func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// SetLetterheadSource wires the school module's tenant letterhead/default
// signature reader in after construction (cmd/api/wire.go, once the
// school module it depends on has itself been registered), for the class
// roster export's Document.Letterhead/Signature.
func (s *Service) SetLetterheadSource(source reportdoc.LetterheadSource) {
	s.letterheads = source
}

// reportLetterhead loads tenantID's configured kop laporan and default
// signature, if any -- (nil, nil) when no letterheads source is wired or
// the tenant has not configured one, so a report renders without one
// rather than failing.
func (s *Service) reportLetterhead(ctx context.Context, tenantID uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	if s.letterheads == nil {
		return nil, nil, nil
	}
	return s.letterheads.Letterhead(ctx, tenantID)
}

// Page is the pagination request every list use case accepts: server-side,
// offset-based (docs/04-clean-code.md section 5 reserves this for "master
// data kecil", which every listing in this module is).
type Page struct {
	Limit  int32
	Offset int32
}

// PageResult is the pagination envelope every list use case returns.
type PageResult struct {
	Total int64
}

func normalizePage(p Page) Page {
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 20
	}
	if p.Offset < 0 {
		p.Offset = 0
	}
	return p
}
