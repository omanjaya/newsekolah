// Package repository is the sqlc-backed implementation of the library
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func isUnique(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

// Titles.

func (r *Repository) CreateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	row, err := r.queries(ctx).CreateTitle(ctx, db.CreateTitleParams{
		TenantID: t.TenantID, Title: t.Title, Subtitle: t.Subtitle, Author: t.Author, Publisher: t.Publisher,
		PublishYear: pgtype.Int4{Int32: int32(t.PublishYear), Valid: t.PublishYear > 0}, //nolint:gosec // validated range
		Isbn:        t.ISBN, Classification: t.Classification, Language: t.Language, CoverAssetID: pdatabase.NullUUID(t.CoverAssetID),
	})
	if err != nil {
		return domain.Title{}, fmt.Errorf("create title: %w", err)
	}
	return toTitle(row), nil
}

func (r *Repository) UpdateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	row, err := r.queries(ctx).UpdateTitle(ctx, db.UpdateTitleParams{
		TenantID: t.TenantID, ID: t.ID, Title: t.Title, Subtitle: t.Subtitle, Author: t.Author, Publisher: t.Publisher,
		PublishYear: pgtype.Int4{Int32: int32(t.PublishYear), Valid: t.PublishYear > 0}, //nolint:gosec // validated range
		Isbn:        t.ISBN, Classification: t.Classification, Language: t.Language, CoverAssetID: pdatabase.NullUUID(t.CoverAssetID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Title{}, domain.ErrTitleNotFound
	}
	if err != nil {
		return domain.Title{}, fmt.Errorf("update title: %w", err)
	}
	return toTitle(row), nil
}

func (r *Repository) GetTitle(ctx context.Context, tenantID, id uuid.UUID) (domain.Title, bool, error) {
	row, err := r.queries(ctx).GetTitle(ctx, db.GetTitleParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Title{}, false, nil
	}
	if err != nil {
		return domain.Title{}, false, fmt.Errorf("get title: %w", err)
	}
	return toTitle(row), true, nil
}

func (r *Repository) ListTitles(ctx context.Context, tenantID uuid.UUID, search string, limit, offset int) ([]domain.Title, error) {
	params := db.ListTitlesParams{TenantID: tenantID, Limit: int32(limit), Offset: int32(offset)} //nolint:gosec // clamped by service
	if search != "" {
		params.Search = pdatabase.Text(search)
	}
	rows, err := r.queries(ctx).ListTitles(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list titles: %w", err)
	}
	out := make([]domain.Title, len(rows))
	for i, row := range rows {
		out[i] = toTitle(row)
	}
	return out, nil
}

func (r *Repository) CountTitleCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountTitleCopies(ctx, db.CountTitleCopiesParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return 0, fmt.Errorf("count title copies: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountAvailableCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountAvailableCopies(ctx, db.CountAvailableCopiesParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return 0, fmt.Errorf("count available copies: %w", err)
	}
	return int(n), nil
}

// Copies.

func (r *Repository) CreateCopy(ctx context.Context, c domain.Copy) (domain.Copy, error) {
	row, err := r.queries(ctx).CreateCopy(ctx, db.CreateCopyParams{
		TenantID: c.TenantID, TitleID: c.TitleID, Barcode: c.Barcode, Condition: string(c.Condition), Notes: c.Notes,
		AcquiredOn: nullableDate(c.AcquiredOn),
	})
	if isUnique(err) {
		return domain.Copy{}, domain.ErrCopyBarcodeExists
	}
	if err != nil {
		return domain.Copy{}, fmt.Errorf("create copy: %w", err)
	}
	return toCopy(row), nil
}

func (r *Repository) GetCopy(ctx context.Context, tenantID, id uuid.UUID) (domain.Copy, bool, error) {
	row, err := r.queries(ctx).GetCopy(ctx, db.GetCopyParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, false, nil
	}
	if err != nil {
		return domain.Copy{}, false, fmt.Errorf("get copy: %w", err)
	}
	return toCopy(row), true, nil
}

func (r *Repository) GetCopyByBarcode(ctx context.Context, tenantID uuid.UUID, barcode string) (domain.Copy, bool, error) {
	row, err := r.queries(ctx).GetCopyByBarcode(ctx, db.GetCopyByBarcodeParams{TenantID: tenantID, Barcode: barcode})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, false, nil
	}
	if err != nil {
		return domain.Copy{}, false, fmt.Errorf("get copy by barcode: %w", err)
	}
	return toCopy(row), true, nil
}

func (r *Repository) ListCopiesForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).ListCopiesForTitle(ctx, db.ListCopiesForTitleParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return nil, fmt.Errorf("list copies for title: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) ListCopiesForStocktake(ctx context.Context, tenantID uuid.UUID) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).ListCopiesForStocktake(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list copies for stocktake: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) UpdateCopyStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.CopyStatus, condition *domain.CopyCondition) (domain.Copy, error) {
	params := db.UpdateCopyStatusParams{TenantID: tenantID, ID: id, Status: string(status)}
	if condition != nil {
		params.Condition = pdatabase.Text(string(*condition))
	}
	row, err := r.queries(ctx).UpdateCopyStatus(ctx, params)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, domain.ErrCopyNotFound
	}
	if err != nil {
		return domain.Copy{}, fmt.Errorf("update copy status: %w", err)
	}
	return toCopy(row), nil
}
