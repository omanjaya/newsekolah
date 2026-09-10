package domain

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// TemplateKind is a document_templates.kind value. permits only issues
// leave_letter today; the others are reserved for the discipline
// (warning_letter), journal (class_journal), library
// (member_card/item_label/clearance_letter) and visitors (visitor_badge)
// modules, sharing this same table.
type TemplateKind string

const (
	TemplateKindLeaveLetter     TemplateKind = "leave_letter"
	TemplateKindWarningLetter   TemplateKind = "warning_letter"
	TemplateKindClassJournal    TemplateKind = "class_journal"
	TemplateKindMemberCard      TemplateKind = "member_card"
	TemplateKindItemLabel       TemplateKind = "item_label"
	TemplateKindClearanceLetter TemplateKind = "clearance_letter"
	TemplateKindReport          TemplateKind = "report"
	TemplateKindVisitorBadge    TemplateKind = "visitor_badge"
)

type Engine string

const (
	EngineHTML Engine = "html"
	EngineDocx Engine = "docx"
)

// Template is one document_templates row: an html/template body plus the
// variable names it expects, rendered by platform/documents.Renderer.
type Template struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	Kind      TemplateKind
	Name      string
	Engine    Engine
	Body      string
	Variables []string
	IsDefault bool
	CreatedBy uuid.NullUUID
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt *time.Time
}

// IssuedDocument is one issued_documents row: the permanent record that a
// numbered document was produced, with a hashed verification code and a
// pointer at the rendered file (asset).
type IssuedDocument struct {
	ID                   uuid.UUID
	TenantID             uuid.UUID
	Kind                 string
	EntityType           string
	EntityID             uuid.UUID
	Number               string
	AssetID              uuid.NullUUID
	SHA256               string
	VerificationCodeHash []byte
	IssuedBy             uuid.NullUUID
	IssuedAt             time.Time
	RevokedAt            *time.Time
}

func (d IssuedDocument) IsRevoked() bool { return d.RevokedAt != nil }

// DefaultLeaveLetterNumberingTemplate is the numbering template used when
// a tenant has not configured its own under
// tenant_policies(kind='document_numbering'). It reproduces the shape of
// the old app's letter numbers (docs/analysis/backend-inventory.md 1.14)
// without the old bug of a hex suffix that could not be audited or
// cross-checked against a sequence.
const DefaultLeaveLetterNumberingTemplate = "{{seq}}/IZIN/{{month_roman}}/{{year}}"

// monthRoman renders 1-12 as the Roman numeral used in Indonesian school
// letter numbering conventions (bulan romawi).
var monthRoman = [...]string{"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}

func MonthRoman(m time.Month) string {
	if m < 1 || int(m) > 12 {
		return ""
	}
	return monthRoman[m]
}

// RenderNumberingTemplate substitutes {{key}} placeholders in template
// with values from vars. An unknown placeholder is left as-is rather than
// silently dropped, so a typo in a tenant's custom template is visible in
// the rendered number instead of producing a malformed one.
func RenderNumberingTemplate(template string, vars map[string]string) string {
	out := template
	for key, value := range vars {
		out = strings.ReplaceAll(out, "{{"+key+"}}", value)
	}
	return out
}

// NumberingVars builds the standard placeholder set for seq at issuedAt:
// {{seq}}, {{month}}, {{month_roman}}, {{year}}.
func NumberingVars(seq int64, issuedAt time.Time) map[string]string {
	return map[string]string{
		"seq":         fmt.Sprintf("%d", seq),
		"month":       fmt.Sprintf("%02d", int(issuedAt.Month())),
		"month_roman": MonthRoman(issuedAt.Month()),
		"year":        fmt.Sprintf("%d", issuedAt.Year()),
	}
}
