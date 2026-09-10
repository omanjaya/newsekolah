// Package service implements permits' use cases: the workflow engine
// (definitions, instances, approver-rule evaluation), scan tokens, exit
// permits, late arrivals, leave requests, and document issuance. It
// orchestrates Repository plus the narrow interfaces below; no SQL, no
// HTTP, per docs/03-layered-architecture.md section 1.
package service

import (
	"context"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// AcademicYearReader is the interface permits needs from the school
// module, structurally identical to identity/service.AcademicYearReader
// (both are satisfied by *school/service.Service without either module
// importing the other).
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// ScheduleLookup is what permits needs from the scheduling module (not
// built in this phase -- migrations 0030-0039 are owned by a different
// module and are not available here) to evaluate the "teacher_of_class_now"
// approver rule: is teacherUserID currently teaching classID, or will they
// be within the next lookaheadSlots periods, on date.
//
// NOT WIRED: Register injects NoopScheduleLookup (always false) until the
// scheduling module merges and cmd/api passes its real implementation.
// Until then, any exit-permit or late-arrival stage using
// "teacher_of_class_now" can only be satisfied by a stage whose
// DistinctFrom/approver_rule a tenant has customized away from the
// default, or manually by an admin editing the workflow instance -- flows
// using the *default* definitions will stall at that stage. This is a
// known, documented gap, not a silent bug.
type ScheduleLookup interface {
	IsTeacherAssignedNowOrNext(ctx context.Context, tenantID, teacherUserID, classID uuid.UUID, date time.Time, lookaheadSlots int) (bool, error)
}

// AttendanceSync is what permits needs from the attendance module (also
// not built in this phase) to apply a forced attendance status -- an exit
// permit's dispensation, a leave request's approved category -- across a
// date/period range. ForceStatus's from/to are calendar dates; the
// attendance module resolves which sessions on those dates the student
// would otherwise have and overwrites their status_code with source
// 'permit'.
//
// NOT WIRED: Register injects NoopAttendanceSync (no-op) until the
// attendance module merges and cmd/api passes its real implementation.
// Until then, issuing an exit permit or leave request records the permits
// side (status, letter, event) correctly but does not touch
// attendance_entries -- a known, documented gap.
type AttendanceSync interface {
	ForceStatus(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, reason string) error
}

// AttendanceBlocker is what permits exports FOR the attendance module: a
// student with an in-progress late arrival today cannot be marked present
// (docs/analysis/backend-inventory.md 1.16). cmd/api wires *Service into
// the attendance module's Dependencies once both modules are merged; until
// then this interface exists only as documentation of the post-merge
// wiring point.
type AttendanceBlocker interface {
	HasBlockingLateArrival(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (bool, error)
}

// GuardianLinks is what permits needs from the identity module to
// evaluate the "guardian_of_student" approver rule and build a guardian's
// review queue: whether a guardian is linked to a student with
// leave-approval rights, and which students a guardian holds that right
// for. Implemented in internal/wiring as an adapter over identity's own
// service.Service (MyChildren, GuardiansOf) -- permits never queries
// identity's tables directly, per docs/03-layered-architecture.md.
type GuardianLinks interface {
	// IsApprovingGuardianOf reports whether guardianUserID is linked to
	// studentUserID with can_approve_leave set.
	IsApprovingGuardianOf(ctx context.Context, tenantID, guardianUserID, studentUserID uuid.UUID) (bool, error)
	// ApprovingChildrenOf returns the student user IDs guardianUserID
	// holds leave-approval rights for.
	ApprovingChildrenOf(ctx context.Context, tenantID, guardianUserID uuid.UUID) ([]uuid.UUID, error)
}

// EventPublisher matches platform/events.Bus's Publish method
// structurally, so this package does not need to import platform/events
// beyond the Event interface itself.
type EventPublisher interface {
	Publish(ctx context.Context, evt events.Event) error
}

// Storage is the narrow slice of platform/storage.Client permits' leave
// evidence and rendered-letter flows need.
type Storage interface {
	PresignedPutURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error)
	PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error)
	GetObject(ctx context.Context, objectKey string) ([]byte, error)
	PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error
}

// Config carries the tunables docs/02-system-design.md section 4.3
// ("Aturan yang dapat diatur") and docs/08-security.md put in
// configuration rather than code, plus the document-signing secret.
type Config struct {
	// DocumentSigningKey is HMAC key material for issued_documents
	// verification codes (config.DOCUMENT_SIGNING_KEY), never the JWT key.
	DocumentSigningKey []byte
	// EvidenceMaxBytes caps a leave request's uploaded evidence image
	// (docs/08-security.md section 6: 6 MB for evidence).
	EvidenceMaxBytes int64
	// Bucket is the S3 bucket permits records on every assets row it
	// creates (config.S3Bucket); the Storage client itself is already
	// bound to this bucket, this is only for the assets table's own
	// bucket column.
	Bucket string
	// LateArrivalActions overrides domain.DefaultLateArrivalActions when
	// non-nil; the caller is expected to have already merged
	// tenant_policies(kind='late_arrival_actions') here per tenant, since
	// Repository has no such read today (see NOT WIRED note in the
	// docstring of ScheduleLookup: tenant_policies reads for permits'
	// specific kinds are not implemented in this phase; the platform
	// default from domain.DefaultLateArrivalActions is what's exercised
	// end to end).
	LateArrivalActions map[int]domain.RequiredAction
}

// DefaultConfig returns Config with every documented default applied,
// for callers that have not (yet) loaded tenant_policies overrides.
func DefaultConfig(documentSigningKey []byte, bucket string) Config {
	return Config{
		DocumentSigningKey: documentSigningKey,
		EvidenceMaxBytes:   6 << 20,
		Bucket:             bucket,
		LateArrivalActions: domain.DefaultLateArrivalActions(),
	}
}

type Service struct {
	pool      *pgxpool.Pool
	repo      Repository
	years     AcademicYearReader
	schedule  ScheduleLookup
	sync      AttendanceSync
	guardians GuardianLinks
	events    EventPublisher
	storage   Storage
	renderer  documents.Renderer
	clock     clock.Clock
	cfg       Config
}

func New(
	pool *pgxpool.Pool,
	repo Repository,
	years AcademicYearReader,
	schedule ScheduleLookup,
	sync AttendanceSync,
	guardians GuardianLinks,
	publisher EventPublisher,
	storage Storage,
	renderer documents.Renderer,
	clk clock.Clock,
	cfg Config,
) *Service {
	return &Service{
		pool: pool, repo: repo, years: years, schedule: schedule, sync: sync, guardians: guardians,
		events: publisher, storage: storage, renderer: renderer, clock: clk, cfg: cfg,
	}
}

// withTx opens the tenant-scoped transaction for one use case; per
// docs/03-layered-architecture.md section 2, the service calls
// database.WithTenantTx, never the transport handler.
func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// activeAcademicYear resolves the tenant's active academic year or
// returns domain.ErrAcademicYearRequired, matching the platform-wide
// convention (docs/03-layered-architecture.md section 6).
func (s *Service) activeAcademicYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	if !ok {
		return uuid.Nil, domain.ErrAcademicYearRequired
	}
	return id, nil
}
