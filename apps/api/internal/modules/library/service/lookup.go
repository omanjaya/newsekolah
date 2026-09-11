package service

import (
	"context"

	"github.com/google/uuid"
)

// maxLookupResults is the old app's cap on a single typeahead response
// (library_circulation_v2.go:41-83).
const maxLookupResults = 8

// LookupResult is one typeahead match: either a member or a copy, never
// both, distinguished by which pointer is non-nil.
type LookupResult struct {
	Member *MemberLookupResult
	Copy   *CopyLookupResult
}

// Lookup is the circulation desk's typeahead: matches on member name,
// member_no, NIS, username, copy barcode, or title, capped at 8 combined
// results (old app: GET /lookup).
func (s *Service) Lookup(ctx context.Context, tenantID uuid.UUID, query string) ([]LookupResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if len(query) < 2 {
		return nil, nil
	}
	members, err := s.repo.LookupMembers(ctx, tenantID, query, maxLookupResults)
	if err != nil {
		return nil, err
	}
	remaining := maxLookupResults - len(members)
	var copies []CopyLookupResult
	if remaining > 0 {
		copies, err = s.repo.LookupCopies(ctx, tenantID, query, remaining)
		if err != nil {
			return nil, err
		}
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
