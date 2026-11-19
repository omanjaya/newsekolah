package service

import (
	"context"
	"unicode/utf8"

	"github.com/google/uuid"
)

// maxLookupResults is the old app's cap on a single typeahead response
// (library_circulation_v2.go:41-83).
const maxLookupResults = 8

// minFuzzyLookupLength is the shortest query searched by substring; a
// shorter one matches only an exact member number, NIS, username or copy
// barcode, since a hand-set member number can be a single character.
const minFuzzyLookupLength = 2

// LookupResult is one typeahead match: either a member or a copy, never
// both, distinguished by which pointer is non-nil.
type LookupResult struct {
	Member *MemberLookupResult
	Copy   *CopyLookupResult
}

// Lookup is the circulation desk's typeahead: matches on member name,
// member_no, NIS, username, copy barcode, or title, capped at 8 combined
// results (old app: GET /lookup). A member whose number, NIS or username
// equals the query is listed first, so an exact card code resolves even
// when more than 8 others merely contain it. A one-character query matches
// exact codes only.
func (s *Service) Lookup(ctx context.Context, tenantID uuid.UUID, query string) ([]LookupResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if query == "" {
		return nil, nil
	}
	exactOnly := utf8.RuneCountInString(query) < minFuzzyLookupLength
	var members []MemberLookupResult
	var copies []CopyLookupResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		members, err = s.repo.LookupMembers(ctx, tenantID, query, exactOnly, maxLookupResults)
		if err != nil {
			return err
		}
		remaining := maxLookupResults - len(members)
		if remaining > 0 {
			copies, err = s.repo.LookupCopies(ctx, tenantID, query, exactOnly, remaining)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	out := make([]LookupResult, 0, len(members)+len(copies))
	for i := range members {
		out = append(out, LookupResult{Member: &members[i]})
	}
	for i := range copies {
		out = append(out, LookupResult{Copy: &copies[i]})
	}
	return out, nil
}
