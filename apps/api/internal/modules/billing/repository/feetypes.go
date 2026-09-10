package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toFeeType(row db.FeeType) domain.FeeType {
	return domain.FeeType{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, Name: row.Name, Description: row.Description,
		AmountMinor: row.AmountMinor, Currency: row.Currency, Recurrence: domain.Recurrence(row.Recurrence),
		Period: pdatabase.TextOrEmpty(row.Period), IsActive: row.IsActive,
		CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy), UpdatedBy: pdatabase.UUIDOrNil(row.UpdatedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) ListFeeTypes(ctx context.Context, tenantID, yearID uuid.UUID, includeInactive bool) ([]domain.FeeType, error) {
	rows, err := r.queries(ctx).ListFeeTypes(ctx, db.ListFeeTypesParams{TenantID: tenantID, AcademicYearID: yearID, IncludeInactive: includeInactive})
	if err != nil {
		return nil, fmt.Errorf("list fee types: %w", err)
	}
	out := make([]domain.FeeType, len(rows))
	for i, row := range rows {
		out[i] = toFeeType(row)
	}
	return out, nil
}

func (r *Repository) ListActiveFeeTypes(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.FeeType, error) {
	rows, err := r.queries(ctx).ListActiveFeeTypes(ctx, db.ListActiveFeeTypesParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, fmt.Errorf("list active fee types: %w", err)
	}
	out := make([]domain.FeeType, len(rows))
	for i, row := range rows {
		out[i] = toFeeType(row)
	}
	return out, nil
}

func (r *Repository) GetFeeType(ctx context.Context, tenantID, id uuid.UUID) (domain.FeeType, bool, error) {
	row, err := r.queries(ctx).GetFeeType(ctx, db.GetFeeTypeParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.FeeType{}, false, nil
	}
	if err != nil {
		return domain.FeeType{}, false, fmt.Errorf("get fee type: %w", err)
	}
	return toFeeType(row), true, nil
}

func (r *Repository) CreateFeeType(ctx context.Context, t domain.FeeType) (domain.FeeType, error) {
	row, err := r.queries(ctx).CreateFeeType(ctx, db.CreateFeeTypeParams{
		TenantID: t.TenantID, AcademicYearID: t.AcademicYearID, Name: t.Name, Description: t.Description,
		AmountMinor: t.AmountMinor, Currency: t.Currency, Recurrence: string(t.Recurrence), Period: pdatabase.Text(t.Period),
		CreatedBy: pdatabase.NullUUID(t.CreatedBy), UpdatedBy: pdatabase.NullUUID(t.UpdatedBy),
	})
	if isUnique(err) {
		return domain.FeeType{}, domain.ErrInvalidInput
	}
	if err != nil {
		return domain.FeeType{}, fmt.Errorf("create fee type: %w", err)
	}
	return toFeeType(row), nil
}

func (r *Repository) UpdateFeeType(ctx context.Context, t domain.FeeType) (domain.FeeType, error) {
	row, err := r.queries(ctx).UpdateFeeType(ctx, db.UpdateFeeTypeParams{
		TenantID: t.TenantID, ID: t.ID, Name: t.Name, Description: t.Description, AmountMinor: t.AmountMinor,
		Currency: t.Currency, Recurrence: string(t.Recurrence), IsActive: t.IsActive,
		UpdatedBy: pdatabase.NullUUID(t.UpdatedBy), Period: pdatabase.Text(t.Period),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.FeeType{}, domain.ErrFeeTypeNotFound
	}
	if isUnique(err) {
		return domain.FeeType{}, domain.ErrInvalidInput
	}
	if err != nil {
		return domain.FeeType{}, fmt.Errorf("update fee type: %w", err)
	}
	return toFeeType(row), nil
}

func (r *Repository) DeleteFeeType(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteFeeType(ctx, db.DeleteFeeTypeParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete fee type: %w", err)
	}
	return nil
}
