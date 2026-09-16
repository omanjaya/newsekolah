package mapping

import "strings"

// assessmentKinds maps the live schema's learning_objectives.type (free
// text, but only four values appear in practice) to
// assessment_components.kind, which is a fixed CHECK-constrained set.
var assessmentKinds = map[string]string{
	"tp":      "formative", // "Tujuan Pembelajaran": the routine formative item
	"sumatif": "summative",
	"praktik": "practical",
}

// MapAssessmentKind translates a live-schema learning objective type to the
// target's assessment_components.kind. Anything not in the known set
// (observed as "Lainnya" at this school, and any future free-text value)
// maps to 'other' rather than being rejected, since assessment_components
// itself already has an 'other' bucket for exactly this.
func MapAssessmentKind(raw string) string {
	if kind, ok := assessmentKinds[strings.ToLower(strings.TrimSpace(raw))]; ok {
		return kind
	}
	return "other"
}
