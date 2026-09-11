// Package service holds the discipline use cases: the violation catalog,
// recording and voiding violations with point snapshots, warning letters
// issued against a tenant policy of levels, and encrypted counseling notes.
package service

import (
	"context"
	"encoding/json"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
)

const (
	policyKindSPLevels          = "discipline_levels"
	policyKindWarningLetterTmpl = "warning_letter_template"
	maxViolationTypesPerRecord  = 50
)

type Repository interface {
	ListViolationTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool, search string) ([]domain.ViolationType, error)
	GetViolationType(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationType, bool, error)
	CreateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error)
	UpdateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error)
	DeleteViolationType(ctx context.Context, tenantID, id uuid.UUID) error

	CreateRecord(ctx context.Context, r domain.ViolationRecord) (domain.ViolationRecord, error)
	GetRecord(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationRecord, bool, error)
	GetRecordByWorkflow(ctx context.Context, tenantID, workflowInstanceID, violationTypeID uuid.UUID) (domain.ViolationRecord, bool, error)
	VoidRecord(ctx context.Context, tenantID, id, voidedBy uuid.UUID, reason string) (domain.ViolationRecord, bool, error)
	ListRecordsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.ViolationRecord, error)
	ListRecords(ctx context.Context, tenantID, yearID uuid.UUID, f RecordFilter) ([]domain.ViolationRecord, error)
	SumActivePoints(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error)
	ListPointTotals(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID, limit int) ([]PointTotal, error)
	ListActivePoints(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID) ([]StudentPointRecord, error)

	CreateLetter(ctx context.Context, l domain.WarningLetter) (domain.WarningLetter, error)
	GetLetter(ctx context.Context, tenantID, id uuid.UUID) (domain.WarningLetter, bool, error)
	ListLettersForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.WarningLetter, error)
	ListLetters(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID, limit, offset int) ([]domain.WarningLetter, error)
	ListSPCandidates(ctx context.Context, tenantID, yearID uuid.UUID, f CandidateFilter) ([]SPCandidate, error)

	CreateCounseling(ctx context.Context, c domain.Counseling, content, followUp, careerGoals, problemDescription []byte, keyID string) (domain.Counseling, error)
	UpdateCounseling(ctx context.Context, c domain.Counseling, content, followUp, careerGoals, problemDescription []byte, keyID string) (domain.Counseling, error)
	GetCounseling(ctx context.Context, tenantID, id uuid.UUID) (EncryptedCounseling, bool, error)
	ListCounselingsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]EncryptedCounseling, error)
	ListCounselingsByCounselor(ctx context.Context, tenantID, yearID, counselorID uuid.UUID, limit, offset int) ([]EncryptedCounseling, error)
	ListCounselingsByVisibility(ctx context.Context, tenantID, yearID uuid.UUID, topic string, limit, offset int) ([]EncryptedCounseling, error)
	DeleteCounseling(ctx context.Context, tenantID, id uuid.UUID) error

	CreateCounselingAttachment(ctx context.Context, tenantID, counselingID, assetID uuid.UUID) (domain.CounselingAttachment, error)
	ListCounselingAttachments(ctx context.Context, tenantID, counselingID uuid.UUID) ([]domain.CounselingAttachment, error)
	GetCounselingAttachment(ctx context.Context, tenantID, id uuid.UUID) (domain.CounselingAttachment, bool, error)

	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	StudentSnapshot(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (StudentSnapshot, error)
	StudentEligible(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (enrolled, active bool, err error)
	HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string, classID uuid.NullUUID) (bool, error)
	ActiveClassID(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (uuid.NullUUID, error)

	CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256Hex, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error)
	GetAsset(ctx context.Context, tenantID, assetID uuid.UUID) (AssetInfo, bool, error)
}

// StudentPointRecord is one active violation's points and date for a
// student, the input to domain.SPPolicy.FirstCrossedDates.
type StudentPointRecord struct {
	StudentUserID uuid.UUID
	Points        int
	OccurredOn    time.Time
}

// CandidateFilter narrows the SP-candidate list (the counselor's issuing
// screen): MinPoints/MaxPoints translate a level filter into the points
// range that level covers, since only the service holds the policy.
type CandidateFilter struct {
	ClassID   uuid.NullUUID
	Search    string
	MinPoints int
	MaxPoints *int
	Limit     int
	Offset    int
}

type SPCandidate struct {
	StudentUserID uuid.UUID
	StudentName   string
	NIS           string
	ClassName     string
	TotalPoints   int
	IssuedLevels  []int
}

type AssetInfo struct {
	ObjectKey string
	Mime      string
	SizeBytes int64
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
	NIS          string
}

// EncryptedCounseling is the stored row before the service opens the
// ciphertext for a permitted reader.
type EncryptedCounseling struct {
	domain.Counseling
	ContentEncrypted            []byte
	FollowUpPlanEncrypted       []byte
	CareerGoalsEncrypted        []byte
	ProblemDescriptionEncrypted []byte
	ContentKeyID                string
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
	LetterID          uuid.UUID
	AcademicYearID    uuid.UUID
	IssuerUserID      uuid.UUID
	NumberingTemplate string
	SeqPad            int
	Vars              map[string]any
}

type IssuedDocument struct {
	Number  string
	AssetID uuid.NullUUID
}

// EventPublisher lets the notifications bridge react to issued letters.
type EventPublisher interface {
	Publish(ctx context.Context, evt interface{ EventName() string }) error
}

// NameLookup resolves user ids to display names, for the reporter/issuer
// names and signature blocks discipline's PDF reports print. Defined here
// (not imported from identity) per docs/03-layered-architecture.md: the
// consuming module owns the interface it needs.
type NameLookup interface {
	Names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

// GuardianReader resolves a student's guardian user ids, so a warning
// letter notifies the parent account the same way it notifies the
// homeroom teacher (the old app's intent per letters.go comment; this
// wiring makes it real).
type GuardianReader interface {
	GuardianIDsOf(ctx context.Context, tenantID, studentUserID uuid.UUID) ([]uuid.UUID, error)
}

// Storage is the narrow slice of platform/storage.Client discipline's
// counseling-attachment upload and ad hoc PDF reports need.
type Storage interface {
	PresignedPutURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error)
	PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error)
	GetObject(ctx context.Context, objectKey string) ([]byte, error)
	PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error
}

// Config carries the tunables that differ per tenant/deployment rather
// than being hardcoded.
type Config struct {
	// Bucket is recorded on every assets row discipline creates; the
	// Storage client itself is already bound to this bucket.
	Bucket string
	// AttachmentMaxBytes caps a counseling note's uploaded photo evidence
	// (docs/08-security.md section 6 sizes leave-request evidence at 6 MB;
	// the old app's counseling photos were capped at 10 MB, kept here).
	AttachmentMaxBytes int64
}

func DefaultConfig(bucket string) Config {
	return Config{Bucket: bucket, AttachmentMaxBytes: 10 << 20}
}

type Service struct {
	pool      *pgxpool.Pool
	repo      Repository
	years     AcademicYearReader
	docs      DocumentIssuer
	sealer    *crypto.Sealer
	events    EventPublisher
	clock     clock.Clock
	names     NameLookup
	guardians GuardianReader
	storage   Storage
	renderer  documents.Renderer
	cfg       Config
}

func New(
	pool *pgxpool.Pool,
	repo Repository,
	years AcademicYearReader,
	docs DocumentIssuer,
	sealer *crypto.Sealer,
	events EventPublisher,
	clk clock.Clock,
	names NameLookup,
	guardians GuardianReader,
	storage Storage,
	renderer documents.Renderer,
	cfg Config,
) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{
		pool: pool, repo: repo, years: years, docs: docs, sealer: sealer, events: events, clock: clk,
		names: names, guardians: guardians, storage: storage, renderer: renderer, cfg: cfg,
	}
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

func (s *Service) loadWarningLetterTemplatePolicy(ctx context.Context, tenantID uuid.UUID) (domain.WarningLetterTemplatePolicy, error) {
	raw, _, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindWarningLetterTmpl)
	if err != nil {
		return domain.WarningLetterTemplatePolicy{}, err
	}
	if !found {
		return domain.DefaultWarningLetterTemplatePolicy(), nil
	}
	var policy domain.WarningLetterTemplatePolicy
	if err := json.Unmarshal(raw, &policy); err != nil {
		return domain.WarningLetterTemplatePolicy{}, err
	}
	return policy, nil
}

// UpdateWarningLetterTemplatePolicy replaces the tenant's warning-letter
// numbering pattern and opening/closing wording.
func (s *Service) UpdateWarningLetterTemplatePolicy(ctx context.Context, tenantID, actorUserID uuid.UUID, next domain.WarningLetterTemplatePolicy) (domain.WarningLetterTemplatePolicy, error) {
	if err := next.Validate(); err != nil {
		return domain.WarningLetterTemplatePolicy{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		_, version, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindWarningLetterTmpl)
		if err != nil {
			return err
		}
		nextVersion := 1
		if found {
			nextVersion = version + 1
		}
		encoded, err := json.Marshal(next)
		if err != nil {
			return err
		}
		return s.repo.CreatePolicy(ctx, tenantID, policyKindWarningLetterTmpl, nextVersion, encoded, s.clock.Now(), uuid.NullUUID{UUID: actorUserID, Valid: true})
	})
	return next, err
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
