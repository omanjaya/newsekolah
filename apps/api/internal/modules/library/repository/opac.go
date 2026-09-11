package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// SearchOpacTitles picks the fulltext path for a 3+ character query and the
// LIKE fallback below that, matching the old app's OPAC search
// (library_opac.go).
func (r *Repository) SearchOpacTitles(ctx context.Context, tenantID uuid.UUID, p service.OpacSearchParams) ([]domain.Title, error) {
	var prefix, search *string
	if p.ClassificationPrefix != "" {
		prefix = &p.ClassificationPrefix
	}
	if p.Search != "" {
		search = &p.Search
	}
	if len([]rune(p.Search)) >= 3 {
		rows, err := r.queries(ctx).SearchOpacTitlesFulltext(ctx, db.SearchOpacTitlesFulltextParams{
			TenantID: tenantID, ClassificationPrefix: pdatabase.Text(deref(prefix)), Search: p.Search,
			Limit: int32(p.Limit), Offset: int32(p.Offset), //nolint:gosec // clamped
		})
		if err != nil {
			return nil, fmt.Errorf("search opac titles fulltext: %w", err)
		}
		return toTitles(rows), nil
	}
	params := db.SearchOpacTitlesShortParams{TenantID: tenantID, Limit: int32(p.Limit), Offset: int32(p.Offset)} //nolint:gosec // clamped
	if prefix != nil {
		params.ClassificationPrefix = pdatabase.Text(*prefix)
	}
	if search != nil {
		params.Search = pdatabase.Text(*search)
	}
	rows, err := r.queries(ctx).SearchOpacTitlesShort(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("search opac titles: %w", err)
	}
	return toTitles(rows), nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (r *Repository) GetOpacTitle(ctx context.Context, tenantID, id uuid.UUID) (domain.Title, bool, error) {
	row, err := r.queries(ctx).GetOpacTitle(ctx, db.GetOpacTitleParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Title{}, false, nil
	}
	if err != nil {
		return domain.Title{}, false, fmt.Errorf("get opac title: %w", err)
	}
	return toTitle(row), true, nil
}

func (r *Repository) ListOpacCopiesForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).ListOpacCopiesForTitle(ctx, db.ListOpacCopiesForTitleParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return nil, fmt.Errorf("list opac copies for title: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) ListOpacNewestTitles(ctx context.Context, tenantID uuid.UUID, limit int) ([]domain.Title, error) {
	rows, err := r.queries(ctx).ListOpacNewestTitles(ctx, db.ListOpacNewestTitlesParams{TenantID: tenantID, Limit: int32(limit)}) //nolint:gosec // clamped
	if err != nil {
		return nil, fmt.Errorf("list opac newest titles: %w", err)
	}
	return toTitles(rows), nil
}

func (r *Repository) ListOpacMostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, limit int) ([]domain.Title, error) {
	rows, err := r.queries(ctx).ListOpacMostBorrowedTitles(ctx, db.ListOpacMostBorrowedTitlesParams{TenantID: tenantID, Limit: int32(limit)}) //nolint:gosec // clamped
	if err != nil {
		return nil, fmt.Errorf("list opac most borrowed titles: %w", err)
	}
	out := make([]domain.Title, len(rows))
	for i, row := range rows {
		out[i] = toTitle(db.LibraryTitle{
			ID: row.ID, TenantID: row.TenantID, Title: row.Title, Subtitle: row.Subtitle, Author: row.Author, Publisher: row.Publisher,
			PublishYear: row.PublishYear, Isbn: row.Isbn, Classification: row.Classification, Language: row.Language,
			CoverAssetID: row.CoverAssetID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, DeletedAt: row.DeletedAt, IsOpac: row.IsOpac,
		})
	}
	return out, nil
}

func toTitles(rows []db.LibraryTitle) []domain.Title {
	out := make([]domain.Title, len(rows))
	for i, row := range rows {
		out[i] = toTitle(row)
	}
	return out
}
