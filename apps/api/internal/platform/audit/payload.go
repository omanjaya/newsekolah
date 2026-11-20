package audit

import (
	"encoding/json"
	"strings"
	"unicode"
)

// bookkeepingFields are the untagged Go fields a domain struct carries
// that the audit row already records in its own columns (entity_id,
// tenant_id, actor_user_id, occurred_at) or that change on every write.
// Left in the payload they only add noise: every create would list them
// as changes and every update would show updated_at.
var bookkeepingFields = map[string]bool{
	"ID":              true,
	"TenantID":        true,
	"CreatedAt":       true,
	"UpdatedAt":       true,
	"CreatedBy":       true,
	"UpdatedBy":       true,
	"CreatedByUserID": true,
}

// normalizePayload gives every audit payload the same shape the audit
// page reads: snake_case top-level keys. A call site that passes a domain
// struct without json tags would otherwise store its Go field names
// (AmountMinor, DayOfMonth) next to entries whose keys are amount_minor
// and event_types. Only keys that are Go field names (they contain an
// upper-case letter) are touched: those are renamed to snake_case and the
// bookkeeping ones dropped. A payload that is not a JSON object, or whose
// keys are already lower case, is returned unchanged.
func normalizePayload(raw []byte) ([]byte, error) {
	if len(raw) == 0 || raw[0] != '{' {
		return raw, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	changed := false
	out := make(map[string]json.RawMessage, len(fields))
	for key, value := range fields {
		if !hasUpper(key) {
			out[key] = value
			continue
		}
		changed = true
		if bookkeepingFields[key] {
			continue
		}
		out[snakeCase(key)] = value
	}
	if !changed {
		return raw, nil
	}
	return json.Marshal(out)
}

func hasUpper(s string) bool {
	return strings.IndexFunc(s, unicode.IsUpper) >= 0
}

// snakeCase turns a Go field name into snake_case, keeping initialisms
// whole: AcademicYearID -> academic_year_id, IPAllowlist -> ip_allowlist.
func snakeCase(name string) string {
	runes := []rune(name)
	var b strings.Builder
	for i, r := range runes {
		if unicode.IsUpper(r) && i > 0 {
			prev := runes[i-1]
			nextLower := i+1 < len(runes) && unicode.IsLower(runes[i+1])
			if unicode.IsLower(prev) || unicode.IsDigit(prev) || (unicode.IsUpper(prev) && nextLower) {
				b.WriteByte('_')
			}
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}
