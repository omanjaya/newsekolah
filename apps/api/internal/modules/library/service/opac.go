package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

const opacHighlightCount = 10

// OpacSearch is the public OPAC search: fulltext for a 3+ character query,
// a LIKE fallback below that, restricted to is_opac titles (old app:
// library_opac.go). Callers behind the public endpoint pass the tenant
// resolved from the host/header, never a user's own tenant from a token.
func (s *Service) OpacSearch(ctx context.Context, tenantID uuid.UUID, in OpacSearchParams) ([]TitleWithAvailability, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	in.Search = strings.TrimSpace(in.Search)
	in.Limit = clampLimit(in.Limit)
	titles, err := s.repo.SearchOpacTitles(ctx, tenantID, in)
	if err != nil {
		return nil, err
	}
	return s.withAvailabilityAll(ctx, tenantID, titles)
}

func (s *Service) withAvailabilityAll(ctx context.Context, tenantID uuid.UUID, titles []domain.Title) ([]TitleWithAvailability, error) {
	out := make([]TitleWithAvailability, len(titles))
	for i, t := range titles {
		var err error
		out[i], err = s.withAvailability(ctx, tenantID, t)
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}

// OpacCopy is one copy shown on a title's public detail page.
type OpacCopy struct {
	Barcode    string
	CallNumber string
	Status     domain.CopyStatus
}

// OpacTitleDetail is a title plus its visible copies, for the public
// detail page.
type OpacTitleDetail struct {
	TitleWithAvailability
	Copies []OpacCopy
}

// OpacTitleDetail returns titleID's public detail, refusing a title that
// is not marked is_opac (old app: only is_opac=TRUE bibliographies are
// ever exposed publicly).
func (s *Service) OpacTitleDetail(ctx context.Context, tenantID, titleID uuid.UUID) (OpacTitleDetail, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return OpacTitleDetail{}, err
	}
	title, found, err := s.repo.GetOpacTitle(ctx, tenantID, titleID)
	if err != nil {
		return OpacTitleDetail{}, err
	}
	if !found {
		return OpacTitleDetail{}, domain.ErrTitleNotFound
	}
	withAvail, err := s.withAvailability(ctx, tenantID, title)
	if err != nil {
		return OpacTitleDetail{}, err
	}
	copies, err := s.repo.ListOpacCopiesForTitle(ctx, tenantID, titleID)
	if err != nil {
		return OpacTitleDetail{}, err
	}
	out := OpacTitleDetail{TitleWithAvailability: withAvail, Copies: make([]OpacCopy, len(copies))}
	for i, c := range copies {
		out.Copies[i] = OpacCopy{Barcode: c.Barcode, CallNumber: title.Classification, Status: c.Status}
	}
	return out, nil
}

// OpacHighlights is the OPAC landing page's two rails: newest additions
// and most-borrowed titles, 10 each (old app: library_opac.go highlights).
type OpacHighlights struct {
	Newest       []TitleWithAvailability
	MostBorrowed []TitleWithAvailability
}

func (s *Service) OpacHighlights(ctx context.Context, tenantID uuid.UUID) (OpacHighlights, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return OpacHighlights{}, err
	}
	newest, err := s.repo.ListOpacNewestTitles(ctx, tenantID, opacHighlightCount)
	if err != nil {
		return OpacHighlights{}, err
	}
	mostBorrowed, err := s.repo.ListOpacMostBorrowedTitles(ctx, tenantID, opacHighlightCount)
	if err != nil {
		return OpacHighlights{}, err
	}
	newestWithAvail, err := s.withAvailabilityAll(ctx, tenantID, newest)
	if err != nil {
		return OpacHighlights{}, err
	}
	mostBorrowedWithAvail, err := s.withAvailabilityAll(ctx, tenantID, mostBorrowed)
	if err != nil {
		return OpacHighlights{}, err
	}
	return OpacHighlights{Newest: newestWithAvail, MostBorrowed: mostBorrowedWithAvail}, nil
}

// LibraryName is the tenant's library display name for the OPAC response
// envelope (old app: every OPAC response carries library_name).
func (s *Service) LibraryName(ctx context.Context, tenantID uuid.UUID) (string, error) {
	policy, err := s.Policy(ctx, tenantID)
	if err != nil {
		return "", err
	}
	return policy.Name, nil
}
