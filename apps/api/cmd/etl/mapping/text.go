package mapping

import (
	"regexp"
	"strings"
)

var htmlTag = regexp.MustCompile(`<[^>]*>`)

// StripHTMLTags removes markup from a SION rich-text field (journals.content
// is saved as a single "<p>...</p>" wrapped paragraph from a WYSIWYG
// editor) and collapses the resulting whitespace, since the target schema's
// equivalent columns are plain text with no HTML rendering. It is not a
// sanitizer for untrusted HTML -- the source is the school's own trusted
// database, not user-submitted markup reaching a browser.
func StripHTMLTags(raw string) string {
	return CleanName(htmlTag.ReplaceAllString(raw, " "))
}

// Truncate shortens s to at most maxLen runes, appending an ellipsis when it
// had to cut, for columns with a `length(col) <= N` check that a source
// free-text field can exceed (e.g. class_journals.topic, capped at 300,
// built from a longer journal entry that has no separate title).
func Truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	if maxLen <= 1 {
		return string(runes[:maxLen])
	}
	return strings.TrimSpace(string(runes[:maxLen-1])) + "…"
}
