package repository

import (
	"strings"
	"unicode"
)

// fulltextMinRunes is the query length from which title search uses the
// search_vector index; shorter queries fall back to a substring match
// (the old app's OPAC rule, library_opac.go).
const fulltextMinRunes = 3

// prefixTSQuery turns free text into a to_tsquery expression that matches
// every word as a prefix: "Lask" becomes "lask:*" and "laskar pel" becomes
// "laskar:* & pel:*", so a word typed halfway already finds its title
// (plainto_tsquery only matches whole words). Tokens are split on anything
// that is not a letter or digit, which leaves no tsquery operator in the
// output. It returns "" when no token is left (punctuation only).
func prefixTSQuery(input string) string {
	tokens := strings.FieldsFunc(input, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	for i, token := range tokens {
		tokens[i] = strings.ToLower(token) + ":*"
	}
	return strings.Join(tokens, " & ")
}

// fulltextQuery is the prefix tsquery for a search long enough to use the
// fulltext index, or "" when the search should use the substring fallback.
func fulltextQuery(search string) string {
	if len([]rune(search)) < fulltextMinRunes {
		return ""
	}
	return prefixTSQuery(search)
}
