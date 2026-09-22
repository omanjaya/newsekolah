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
//
// Wrapped in withTx: this runs pre-auth, off a pooled connection that may
// have served an unrelated tenant transaction moments earlier, so
// app.tenant_id must be set explicitly here rather than left to whatever
// the connection's session GUC happens to be (docs/08-security.md section
// 4; see migration 0110's comment for why an unset one is not simply "no
// rows").
func (s *Service) OpacSearch(ctx context.Context, tenantID uuid.UUID, in OpacSearchParams) ([]TitleWithAvailability, error) {
	var out []TitleWithAvailability
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		in.Search = strings.TrimSpace(in.Search)
		in.Limit = clampLimit(in.Limit)
		titles, err := s.repo.SearchOpacTitles(ctx, tenantID, in)
		if err != nil {
			return err
		}
		out, err = s.withAvailabilityAll(ctx, tenantID, titles)
		return err
	})
	return out, err
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
	LocationID uuid.NullUUID
	Access     domain.CopyAccess
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
// ever exposed publicly). Wrapped in withTx: see OpacSearch's doc comment.
func (s *Service) OpacTitleDetail(ctx context.Context, tenantID, titleID uuid.UUID) (OpacTitleDetail, error) {
	var out OpacTitleDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		title, found, err := s.repo.GetOpacTitle(ctx, tenantID, titleID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrTitleNotFound
		}
		withAvail, err := s.withAvailability(ctx, tenantID, title)
		if err != nil {
			return err
		}
		copies, err := s.repo.ListOpacCopiesForTitle(ctx, tenantID, titleID)
		if err != nil {
			return err
		}
		out = OpacTitleDetail{TitleWithAvailability: withAvail, Copies: make([]OpacCopy, len(copies))}
		for i, c := range copies {
			out.Copies[i] = OpacCopy{
				Barcode: c.Barcode, CallNumber: c.CallNumber, LocationID: c.LocationID, Access: c.Access, Status: c.Status,
			}
		}
		return nil
	})
	return out, err
}

// OpacHighlights is the OPAC landing page's two rails: newest additions
// and most-borrowed titles, 10 each (old app: library_opac.go highlights).
type OpacHighlights struct {
	Newest       []TitleWithAvailability
	MostBorrowed []TitleWithAvailability
}

// OpacHighlights is wrapped in withTx: see OpacSearch's doc comment.
func (s *Service) OpacHighlights(ctx context.Context, tenantID uuid.UUID) (OpacHighlights, error) {
	var out OpacHighlights
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		newest, err := s.repo.ListOpacNewestTitles(ctx, tenantID, opacHighlightCount)
		if err != nil {
			return err
		}
		mostBorrowed, err := s.repo.ListOpacMostBorrowedTitles(ctx, tenantID, opacHighlightCount)
		if err != nil {
			return err
		}
		newestWithAvail, err := s.withAvailabilityAll(ctx, tenantID, newest)
		if err != nil {
			return err
		}
		mostBorrowedWithAvail, err := s.withAvailabilityAll(ctx, tenantID, mostBorrowed)
		if err != nil {
			return err
		}
		out = OpacHighlights{Newest: newestWithAvail, MostBorrowed: mostBorrowedWithAvail}
		return nil
	})
	return out, err
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
