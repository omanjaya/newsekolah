package domain

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// WhatsAppTemplate is a tenant-owned, named message template: a body with
// {{placeholder}} variables, the locale it is written in, and the name of
// the corresponding template already approved in the tenant's WhatsApp
// Business Manager (the Meta Cloud API only accepts pre-approved
// templates for a business-initiated message).
type WhatsAppTemplate struct {
	ID               uuid.UUID
	TenantID         uuid.UUID
	Name             string
	Locale           string
	MetaTemplateName string
	Body             string
	Placeholders     []string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

var templatePlaceholder = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`)

// ExtractPlaceholders lists the distinct {{name}} variables a template
// body references, in first-appearance order.
func ExtractPlaceholders(body string) []string {
	matches := templatePlaceholder.FindAllStringSubmatch(body, -1)
	seen := make(map[string]bool, len(matches))
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		name := m[1]
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

// RenderTemplate substitutes every {{placeholder}} in the template body
// with its value from vars. It is a pure function so template authoring
// can be previewed and unit tested without touching the database or a
// provider. A variable referenced by the body but missing from vars is a
// hard error -- silently sending "{{name}}" literally to a parent is
// worse than failing the send.
func RenderTemplate(tmpl WhatsAppTemplate, vars map[string]string) (string, error) {
	var missing []string
	rendered := templatePlaceholder.ReplaceAllStringFunc(tmpl.Body, func(match string) string {
		name := templatePlaceholder.FindStringSubmatch(match)[1]
		value, ok := vars[name]
		if !ok {
			missing = append(missing, name)
			return match
		}
		return value
	})
	if len(missing) > 0 {
		return "", fmt.Errorf("%w: %s", ErrMissingTemplateVariable, strings.Join(missing, ", "))
	}
	return rendered, nil
}
