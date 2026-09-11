// Package service holds the discipline use cases: the violation catalog,
// recording and voiding violations with point snapshots, warning letters
// issued against a tenant policy of levels, and encrypted counseling notes.
package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

const policyKindSPLevels = "discipline_levels"

type Repository interface {
	ListViolationTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]domain.ViolationType, error)
	GetViolationType(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationType, bool, error)
	CreateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error)
	UpdateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error)
	DeleteViolationType(ctx context.Context, tenantID, id uuid.UUID) error

	CreateRecord(ctx context.Context, r domain.ViolationRecord) (domain.ViolationRecord, error)
	DeleteRecordsBySessionStudent(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID) error
	GetRecord(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationRecord, bool, error)
	VoidRecord(ctx context.Context, tenantID, id, voidedBy uuid.UUID, reason string) (domain.ViolationRecord, bool, error)
	ListRecordsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.ViolationRecord, error)
	ListRecords(ctx context.Context, tenantID, yearID uuid.UUID, f RecordFilter) ([]domain.ViolationRecord, error)
	SumActivePoints(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error)
	ListPointTotals(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID, limit int) ([]PointTotal, error)

	CreateLetter(ctx context.Context, l domain.WarningLetter) (domain.WarningLetter, error)
	GetLetter(ctx context.Context, tenantID, id uuid.UUID) (domain.WarningLetter, bool, error)
	ListLettersForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.WarningLetter, error)
	ListLetters(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID, limit, offset int) ([]domain.WarningLetter, error)

	CreateCounseling(ctx context.Context, c domain.Counseling, content, followUp []byte, keyID string) (domain.Counseling, error)
	UpdateCounseling(ctx context.Context, c domain.Counseling, content, followUp []byte, keyID string) (domain.Counseling, error)
	GetCounseling(ctx context.Context, tenantID, id uuid.UUID) (EncryptedCounseling, bool, error)
	ListCounselingsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]EncryptedCounseling, error)
	ListCounselingsByCounselor(ctx context.Context, tenantID, yearID, counselorID uuid.UUID, limit, offset int) ([]EncryptedCounseling, error)
	DeleteCounseling(ctx context.Context, tenantID, id uuid.UUID) error

	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	StudentSnapshot(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (StudentSnapshot, error)
	HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string, classID uuid.NullUUID) (bool, error)
	ActiveClassID(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (uuid.NullUUID, error)
}

type RecordFilter struct {
	ClassID       uuid.NullUUID
	From, To      *time.Time
	IncludeVoided bool
	Limit, Offset int
}

type PointTotal struct {
	StudentUserID  uuid.UUID
	Total          int
	RecordCount    int
	LastOccurredOn time.Time
}

type StudentSnapshot struct {
	StudentName  string
	ClassName    string
	GuardianName string
}

// EncryptedCounseling is the stored row before the service opens the
// ciphertext for a permitted reader.
type EncryptedCounseling struct {
	domain.Counseling
	ContentEncrypted      []byte
	FollowUpPlanEncrypted []byte
	ContentKeyID          string
}

// AcademicYearReader is what discipline needs from the school module.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// DocumentIssuer is the permits module's document pipeline, reached through
// a wiring adapter so discipline never imports permits.
type DocumentIssuer interface {
	IssueWarningLetter(ctx context.Context, tenantID uuid.UUID, in WarningLetterDocument) (IssuedDocument, error)
	DocumentURL(ctx context.Context, tenantID, assetID uuid.UUID) (string, error)
}

type WarningLetterDocument struct {
	LetterID       uuid.UUID
	AcademicYearID uuid.UUID
	IssuerUserID   uuid.UUID
	Vars           map[string]any
}

type IssuedDocument struct {
	Number  string
	AssetID uuid.NullUUID
}

// EventPublisher lets the notifications bridge react to issued letters.
type EventPublisher interface {
	Publish(ctx context.Context, evt interface{ EventName() string }) error
}

type Service struct {
	pool   *pgxpool.Pool
	repo   Repository
	years  AcademicYearReader
	docs   DocumentIssuer
	sealer *crypto.Sealer
	events EventPublisher
	clock  clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, docs DocumentIssuer, sealer *crypto.Sealer, events EventPublisher, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, docs: docs, sealer: sealer, events: events, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

func (s *Service) activeYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	if !ok {
		return uuid.Nil, domain.ErrNoActiveAcademicYear
	}
	return id, nil
}

// Policy returns the tenant's SP ladder, seeding the platform default on
// first read so every school starts with a sensible configuration.
func (s *Service) Policy(ctx context.Context, tenantID uuid.UUID) (domain.SPPolicy, error) {
	var policy domain.SPPolicy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		policy, err = s.loadPolicy(ctx, tenantID)
		return err
	})
	return policy, err
}

func (s *Service) loadPolicy(ctx context.Context, tenantID uuid.UUID) (domain.SPPolicy, error) {
	raw, version, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindSPLevels)
	if err != nil {
		return domain.SPPolicy{}, err
	}
	if !found {
		def := domain.DefaultSPPolicy()
		encoded, err := json.Marshal(def)
		if err != nil {
			return domain.SPPolicy{}, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, policyKindSPLevels, def.Version, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return domain.SPPolicy{}, err
		}
		return def, nil
	}
	var policy domain.SPPolicy
	if err := json.Unmarshal(raw, &policy); err != nil {
		return domain.SPPolicy{}, err
	}
	policy.Version = version
	return policy, nil
}

// UpdatePolicy appends a new version of the SP ladder.
func (s *Service) UpdatePolicy(ctx context.Context, tenantID, actorUserID uuid.UUID, levels []domain.SPLevel) (domain.SPPolicy, error) {
	next := domain.SPPolicy{Levels: levels}
	if err := next.Validate(); err != nil {
		return domain.SPPolicy{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		next.Version = current.Version + 1
		encoded, err := json.Marshal(next)
		if err != nil {
			return err
		}
		return s.repo.CreatePolicy(ctx, tenantID, policyKindSPLevels, next.Version, encoded, s.clock.Now(), uuid.NullUUID{UUID: actorUserID, Valid: true})
	})
	return next, err
}
