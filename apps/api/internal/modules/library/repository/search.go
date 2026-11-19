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
// every word as a prefix: "Lask" becomes "'lask':*" and "laskar pel"
// becomes "'laskar':* & 'pel':*", so a word typed halfway already finds its
// title (plainto_tsquery only matches whole words).
//
// The input is split on whitespace only and each token is passed as a
// quoted tsquery literal, so Postgres's own parser cuts it the same way it
// cut search_vector: "J.K." stays the lexeme "j.k", "M.Pd" stays "m.pd" and
// "2.0" stays "2.0". Splitting on punctuation here would turn them into
// words the vector never holds. Quoting also leaves no tsquery operator in
// the output; a token with no lexeme (such as "&") is dropped by Postgres.
// It returns "" when the input has no letter or digit at all.
func prefixTSQuery(input string) string {
	if !strings.ContainsFunc(input, isWordRune) {
		return ""
	}
	tokens := strings.Fields(input)
	for i, token := range tokens {
		tokens[i] = quoteTSQueryLiteral(strings.ToLower(token)) + ":*"
	}
	return strings.Join(tokens, " & ")
}

// quoteTSQueryLiteral wraps a token as a tsquery quoted literal, doubling
// the backslashes and single quotes inside it.
func quoteTSQueryLiteral(token string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `'`, `''`).Replace(token)
	return "'" + escaped + "'"
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

// fulltextQuery is the prefix tsquery for a search long enough to use the
// fulltext index, or "" when the search should use the substring fallback.
func fulltextQuery(search string) string {
	if len([]rune(search)) < fulltextMinRunes {
		return ""
	}
	return prefixTSQuery(search)
}
