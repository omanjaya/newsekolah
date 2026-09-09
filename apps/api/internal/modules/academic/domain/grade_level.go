package domain

import "github.com/google/uuid"

type GradeLevel struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Code     string
	Name     string
	Sequence int16
}

type Track struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Code     string
	Name     string
}

// GradeLevelTemplate is one row a grade-level template contributes; Sequence
// establishes progression order for promotion planning (BuildPromotionPlan).
type GradeLevelTemplate struct {
	Code     string
	Name     string
	Sequence int16
}

// Education-level templates ported from the old app's implicit level
// conventions (docs/analysis/backend-inventory.md section 3): grade codes
// as Indonesian schools write them on report cards, not "1..N".
const (
	TemplateSD  = "sd"
	TemplateSMP = "smp"
	TemplateSMA = "sma"
	TemplateSMK = "smk"
)

var gradeLevelTemplates = map[string][]GradeLevelTemplate{
	TemplateSD: {
		{Code: "1", Name: "Kelas 1", Sequence: 1},
		{Code: "2", Name: "Kelas 2", Sequence: 2},
		{Code: "3", Name: "Kelas 3", Sequence: 3},
		{Code: "4", Name: "Kelas 4", Sequence: 4},
		{Code: "5", Name: "Kelas 5", Sequence: 5},
		{Code: "6", Name: "Kelas 6", Sequence: 6},
	},
	TemplateSMP: {
		{Code: "7", Name: "Kelas 7", Sequence: 1},
		{Code: "8", Name: "Kelas 8", Sequence: 2},
		{Code: "9", Name: "Kelas 9", Sequence: 3},
	},
	TemplateSMA: {
		{Code: "X", Name: "Kelas X", Sequence: 1},
		{Code: "XI", Name: "Kelas XI", Sequence: 2},
		{Code: "XII", Name: "Kelas XII", Sequence: 3},
	},
	TemplateSMK: {
		{Code: "X", Name: "Kelas X", Sequence: 1},
		{Code: "XI", Name: "Kelas XI", Sequence: 2},
		{Code: "XII", Name: "Kelas XII", Sequence: 3},
	},
}

// GradeLevelTemplateRows returns the rows for a known template key, or
// ErrUnknownTemplate for anything else.
func GradeLevelTemplateRows(key string) ([]GradeLevelTemplate, error) {
	rows, ok := gradeLevelTemplates[key]
	if !ok {
		return nil, ErrUnknownTemplate
	}
	out := make([]GradeLevelTemplate, len(rows))
	copy(out, rows)
	return out, nil
}
