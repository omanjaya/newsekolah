// Package domain holds the discipline module's entities and the rules the
// old application spread across handlers: point snapshots, warning-letter
// levels driven by a tenant policy, and counseling visibility.
package domain

import (
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
)

var (
	ErrViolationTypeNotFound   = errors.New("violation type not found")
	ErrViolationTypeCodeExists = errors.New("violation type code already exists")
	ErrViolationTypeInactive   = errors.New("violation type is inactive")
	ErrRecordNotFound          = errors.New("violation record not found")
	ErrRecordAlreadyVoided     = errors.New("violation record already voided")
	ErrLetterNotFound          = errors.New("warning letter not found")
	ErrLetterLevelNotDue       = errors.New("warning letter level not reached")
	ErrLetterAlreadyIssued     = errors.New("warning letter level already issued")
	ErrCounselingNotFound      = errors.New("counseling not found")
	ErrCounselingForbidden     = errors.New("counseling not visible to this user")
	ErrNoActiveAcademicYear    = errors.New("no active academic year")
	ErrInvalidInput            = errors.New("invalid input")
)

type ViolationType struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Code     string
	Name     string
	Points   int
	Category string
	IsActive bool
}

type ViolationRecord struct {
	ID                  uuid.UUID
	TenantID            uuid.UUID
	AcademicYearID      uuid.UUID
	StudentUserID       uuid.UUID
	ViolationTypeID     uuid.UUID
	TypeCode            string
	TypeName            string
	TypeCategory        string
	PointsSnapshot      int
	OccurredOn          time.Time
	AttendanceSessionID uuid.NullUUID
	WorkflowInstanceID  uuid.NullUUID
	ReporterUserID      uuid.UUID
	Notes               string
	CreatedAt           time.Time
	VoidedAt            *time.Time
	VoidedBy            uuid.NullUUID
	VoidReason          string
}

func (r ViolationRecord) IsVoided() bool { return r.VoidedAt != nil }

type WarningLetter struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	AcademicYearID  uuid.UUID
	StudentUserID   uuid.UUID
	Level           int
	LevelLabel      string
	ThresholdPoints int
	TotalPoints     int
	LetterNumber    string
	IssuedBy        uuid.NullUUID
	IssuedAt        time.Time
	Snapshot        []byte
	DocumentAssetID uuid.NullUUID
}

// SPLevel is one rung of the warning-letter ladder
// (docs/02-system-design.md section 4.3, "discipline.sp_levels").
type SPLevel struct {
	Level     int    `json:"level"`
	MinPoints int    `json:"min_points"`
	Label     string `json:"label"`
}

type SPPolicy struct {
	Version int       `json:"version"`
	Levels  []SPLevel `json:"levels"`
}

func DefaultSPPolicy() SPPolicy {
	return SPPolicy{Version: 1, Levels: []SPLevel{
		{Level: 1, MinPoints: 25, Label: "SP 1"},
		{Level: 2, MinPoints: 50, Label: "SP 2"},
		{Level: 3, MinPoints: 75, Label: "SP 3"},
	}}
}

func (p SPPolicy) Validate() error {
	if len(p.Levels) == 0 {
		return ErrInvalidInput
	}
	sorted := append([]SPLevel(nil), p.Levels...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Level < sorted[j].Level })
	for i, lvl := range sorted {
		if lvl.Level != i+1 || lvl.MinPoints <= 0 || lvl.Label == "" {
			return ErrInvalidInput
		}
		if i > 0 && lvl.MinPoints <= sorted[i-1].MinPoints {
			return ErrInvalidInput
		}
	}
	return nil
}

// LevelFor returns the highest level whose threshold total reaches.
func (p SPPolicy) LevelFor(total int) (SPLevel, bool) {
	var best SPLevel
	found := false
	for _, lvl := range p.Levels {
		if total >= lvl.MinPoints && (!found || lvl.Level > best.Level) {
			best, found = lvl, true
		}
	}
	return best, found
}

// DueLevels lists the levels reached by total that have not been issued
// yet, lowest first, so the counselor issues SP 1 before SP 2.
func (p SPPolicy) DueLevels(total int, issued []WarningLetter) []SPLevel {
	have := make(map[int]bool, len(issued))
	for _, l := range issued {
		have[l.Level] = true
	}
	var due []SPLevel
	for _, lvl := range p.Levels {
		if total >= lvl.MinPoints && !have[lvl.Level] {
			due = append(due, lvl)
		}
	}
	sort.Slice(due, func(i, j int) bool { return due[i].Level < due[j].Level })
	return due
}

type CounselingKind string

const (
	CounselingIndividual CounselingKind = "individual"
	CounselingGroup      CounselingKind = "group"
	CounselingParent     CounselingKind = "parent"
	CounselingReferral   CounselingKind = "referral"
)

func (k CounselingKind) Valid() bool {
	switch k {
	case CounselingIndividual, CounselingGroup, CounselingParent, CounselingReferral:
		return true
	}
	return false
}

type Visibility string

const (
	VisibilityCounselor  Visibility = "counselor"
	VisibilityBKTeam     Visibility = "bk_team"
	VisibilityLeadership Visibility = "leadership"
)

func (v Visibility) Valid() bool {
	switch v {
	case VisibilityCounselor, VisibilityBKTeam, VisibilityLeadership:
		return true
	}
	return false
}

// Counseling notes are decrypted only for readers the visibility allows;
// Content and FollowUpPlan are empty on rows the caller may list but not open.
type Counseling struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	AcademicYearID  uuid.UUID
	StudentUserID   uuid.UUID
	CounselorUserID uuid.UUID
	SessionAt       time.Time
	Kind            CounselingKind
	Title           string
	Content         string
	FollowUpPlan    string
	Visibility      Visibility
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ReaderRole is what the service resolves about the caller before applying
// visibility: the author always reads; bk_team opens to any counselor;
// leadership opens to counselors and leadership.
type ReaderRole struct {
	IsAuthor     bool
	IsCounselor  bool
	IsLeadership bool
}

func (c Counseling) VisibleTo(r ReaderRole) bool {
	if r.IsAuthor {
		return true
	}
	switch c.Visibility {
	case VisibilityBKTeam:
		return r.IsCounselor
	case VisibilityLeadership:
		return r.IsCounselor || r.IsLeadership
	default:
		return false
	}
}

const DefaultWarningLetterNumberingTemplate = "{{seq}}/SP/{{month_roman}}/{{year}}"
