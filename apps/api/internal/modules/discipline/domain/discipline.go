// Package domain holds the discipline module's entities and the rules the
// old application spread across handlers: point snapshots, warning-letter
// levels driven by a tenant policy, and counseling visibility.
package domain

import (
	"errors"
	"sort"
	"strings"
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
	ErrStudentNotEnrolled      = errors.New("student has no active enrollment in the active academic year")
	ErrStudentInactive         = errors.New("student account is not active")
	ErrAttachmentNotFound      = errors.New("attachment not found")
	ErrAttachmentTooLarge      = errors.New("attachment file exceeds the size limit")
	ErrAttachmentInvalidType   = errors.New("attachment file is not a supported image type")
	ErrReportUnavailable       = errors.New("pdf report generation is not configured for this deployment")
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

// PointRecord is the minimal shape FirstCrossedDates needs: one active
// violation's points and date, without pulling in the full ViolationRecord.
type PointRecord struct {
	Points     int
	OccurredOn time.Time
}

// FirstCrossedDates returns, for each level in the policy, the earliest
// date the running total (records applied in occurred_on order) first
// reached that level's threshold -- the "Status SP" column the old app
// printed on its point recap. A level absent from the result was never
// reached. Records do not need to already be sorted.
func (p SPPolicy) FirstCrossedDates(records []PointRecord) map[int]time.Time {
	sorted := append([]PointRecord(nil), records...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].OccurredOn.Before(sorted[j].OccurredOn) })

	out := make(map[int]time.Time, len(p.Levels))
	remaining := make(map[int]int, len(p.Levels))
	for _, lvl := range p.Levels {
		remaining[lvl.Level] = lvl.MinPoints
	}
	total := 0
	for _, r := range sorted {
		total += r.Points
		for _, lvl := range p.Levels {
			if _, reached := out[lvl.Level]; reached {
				continue
			}
			if total >= remaining[lvl.Level] {
				out[lvl.Level] = r.OccurredOn
			}
		}
	}
	return out
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

// CounselingTopic is what the session was about, independent of its
// format (Kind). The old app called this "jenis konseling"; here it sits
// alongside the individual/group/parent/referral session format instead
// of replacing it.
type CounselingTopic string

const (
	TopicCareer   CounselingTopic = "career"
	TopicProblem  CounselingTopic = "problem"
	TopicPersonal CounselingTopic = "personal"
	TopicLearning CounselingTopic = "learning"
	TopicSocial   CounselingTopic = "social"
	TopicOther    CounselingTopic = "other"
)

// DefaultCounselingTopic matches the old app's default (counseling.go:511).
const DefaultCounselingTopic = TopicProblem

func (t CounselingTopic) Valid() bool {
	switch t {
	case TopicCareer, TopicProblem, TopicPersonal, TopicLearning, TopicSocial, TopicOther:
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
	ID                 uuid.UUID
	TenantID           uuid.UUID
	AcademicYearID     uuid.UUID
	StudentUserID      uuid.UUID
	CounselorUserID    uuid.UUID
	SessionAt          time.Time
	Kind               CounselingKind
	Topic              CounselingTopic
	Title              string
	Content            string
	FollowUpPlan       string
	CareerGoals        string
	ProblemDescription string
	Visibility         Visibility
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// CounselingAttachment is one photo evidence file attached to a note
// (counseling_attachments), mirroring a leave request's evidence: an
// asset row plus who it belongs to.
type CounselingAttachment struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	CounselingID uuid.UUID
	AssetID      uuid.UUID
	CreatedAt    time.Time
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

// DefaultWarningLetterOpeningText and DefaultWarningLetterClosingText are
// the paragraphs printed before and after the violation table on a
// warning letter, until a tenant configures its own under this policy.
const (
	DefaultWarningLetterOpeningText = "Berdasarkan catatan pelanggaran tata tertib, siswa tersebut telah mencapai ambang batas poin berikut, dengan rincian:"
	DefaultWarningLetterClosingText = "Kami mohon perhatian dan kerja sama Orang Tua/Wali untuk pembinaan lebih lanjut."
)

// WarningLetterTemplatePolicy is the tenant-configurable numbering and
// wording for warning letters (tenant_policies kind
// "warning_letter_template"), replacing the old app's fixed
// settings.WarningLetterTemplate. NumberPattern accepts {{seq}},
// {{sp_level_number}}, {{month_roman}} and {{year}}; SeqPad zero-pads
// {{seq}} (the old app used %03d).
type WarningLetterTemplatePolicy struct {
	NumberPattern string `json:"number_pattern"`
	SeqPad        int    `json:"seq_pad"`
	OpeningText   string `json:"opening_text"`
	ClosingText   string `json:"closing_text"`
}

func DefaultWarningLetterTemplatePolicy() WarningLetterTemplatePolicy {
	return WarningLetterTemplatePolicy{
		NumberPattern: DefaultWarningLetterNumberingTemplate, SeqPad: 3,
		OpeningText: DefaultWarningLetterOpeningText, ClosingText: DefaultWarningLetterClosingText,
	}
}

func (p WarningLetterTemplatePolicy) Validate() error {
	if strings.TrimSpace(p.NumberPattern) == "" || p.SeqPad < 0 || p.SeqPad > 10 {
		return ErrInvalidInput
	}
	return nil
}
