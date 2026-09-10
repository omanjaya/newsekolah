package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func int4(n int) pgtype.Int4 {
	if n == 0 {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(n), Valid: true} //nolint:gosec // bounded by the 0-10000 basis-point check
}

func int4OrZero(v pgtype.Int4) int {
	if !v.Valid {
		return 0
	}
	return int(v.Int32)
}

func toInt8(n int64) pgtype.Int8 {
	if n == 0 {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: n, Valid: true}
}

func int8FromRow(v pgtype.Int8) int64 {
	if !v.Valid {
		return 0
	}
	return v.Int64
}

func toDiscount(row db.FeeDiscount) domain.Discount {
	return domain.Discount{
		ID: row.ID, TenantID: row.TenantID, FeeTypeID: row.FeeTypeID, StudentUserID: row.StudentUserID,
		Kind: domain.DiscountKind(row.Kind), PercentageBp: int4OrZero(row.PercentageBp), AmountMinor: int8FromRow(row.AmountMinor),
		Reason: row.Reason, IsActive: row.IsActive, CreatedByUserID: pdatabase.UUIDOrNil(row.CreatedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) ListDiscountsForFeeType(ctx context.Context, tenantID, feeTypeID uuid.UUID) ([]domain.Discount, error) {
	rows, err := r.queries(ctx).ListDiscountsForFeeType(ctx, db.ListDiscountsForFeeTypeParams{TenantID: tenantID, FeeTypeID: feeTypeID})
	if err != nil {
		return nil, fmt.Errorf("list discounts for fee type: %w", err)
	}
	return toDiscounts(rows), nil
}

func (r *Repository) ListDiscountsForStudent(ctx context.Context, tenantID, studentID uuid.UUID) ([]domain.Discount, error) {
	rows, err := r.queries(ctx).ListDiscountsForStudent(ctx, db.ListDiscountsForStudentParams{TenantID: tenantID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list discounts for student: %w", err)
	}
	return toDiscounts(rows), nil
}

func (r *Repository) ListActiveDiscounts(ctx context.Context, tenantID uuid.UUID, feeTypeIDs []uuid.UUID) ([]domain.Discount, error) {
	if len(feeTypeIDs) == 0 {
		return nil, nil
	}
	rows, err := r.queries(ctx).ListActiveDiscounts(ctx, db.ListActiveDiscountsParams{TenantID: tenantID, FeeTypeIds: feeTypeIDs})
	if err != nil {
		return nil, fmt.Errorf("list active discounts: %w", err)
	}
	return toDiscounts(rows), nil
}

func toDiscounts(rows []db.FeeDiscount) []domain.Discount {
	out := make([]domain.Discount, len(rows))
	for i, row := range rows {
		out[i] = toDiscount(row)
	}
	return out
}

func (r *Repository) GetDiscount(ctx context.Context, tenantID, id uuid.UUID) (domain.Discount, bool, error) {
	row, err := r.queries(ctx).GetDiscount(ctx, db.GetDiscountParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Discount{}, false, nil
	}
	if err != nil {
		return domain.Discount{}, false, fmt.Errorf("get discount: %w", err)
	}
	return toDiscount(row), true, nil
}

func (r *Repository) CreateDiscount(ctx context.Context, d domain.Discount) (domain.Discount, error) {
	row, err := r.queries(ctx).CreateDiscount(ctx, db.CreateDiscountParams{
		TenantID: d.TenantID, FeeTypeID: d.FeeTypeID, StudentUserID: d.StudentUserID, Kind: string(d.Kind),
		Reason: d.Reason, CreatedBy: pdatabase.NullUUID(d.CreatedByUserID), PercentageBp: int4(d.PercentageBp), AmountMinor: toInt8(d.AmountMinor),
	})
	if err != nil {
		return domain.Discount{}, fmt.Errorf("create discount: %w", err)
	}
	return toDiscount(row), nil
}

func (r *Repository) UpdateDiscount(ctx context.Context, d domain.Discount) (domain.Discount, error) {
	row, err := r.queries(ctx).UpdateDiscount(ctx, db.UpdateDiscountParams{
		TenantID: d.TenantID, ID: d.ID, Kind: string(d.Kind), Reason: d.Reason, IsActive: d.IsActive,
		PercentageBp: int4(d.PercentageBp), AmountMinor: toInt8(d.AmountMinor),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Discount{}, domain.ErrDiscountNotFound
	}
	if err != nil {
		return domain.Discount{}, fmt.Errorf("update discount: %w", err)
	}
	return toDiscount(row), nil
}

func (r *Repository) DeleteDiscount(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteDiscount(ctx, db.DeleteDiscountParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete discount: %w", err)
	}
	return nil
}
