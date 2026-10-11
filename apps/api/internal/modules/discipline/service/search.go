package service

import (
	"strings"
	"unicode/utf8"
)

// minSearchRunes is the shortest search term worth a trigram scan; shorter
// input is treated as "no search" so a single keystroke never filters.
const minSearchRunes = 2

// SearchTerm normalises a list search box value for the ILIKE filters on
// student name and NIS: trimmed, and empty (no filter) when shorter than
// minSearchRunes. LIKE wildcards in the input are escaped so they match
// literally. Counseling notes are encrypted at rest, so these filters only
// ever target the joined student columns, never note content.
func SearchTerm(raw string) string {
	term := strings.TrimSpace(raw)
	if utf8.RuneCountInString(term) < minSearchRunes {
		return ""
	}
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(term)
}
