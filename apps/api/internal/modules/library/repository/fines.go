package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateViolation(ctx context.Context, v domain.Violation) (domain.Violation, error) {
	row, err := r.queries(ctx).CreateViolation(ctx, db.CreateViolationParams{
		TenantID: v.TenantID, LoanID: pdatabase.NullUUID(v.LoanID), MemberUserID: v.MemberUserID, Kind: string(v.Kind),
		Penalty: string(v.Penalty), Amount: int32(v.Amount), SuspendDays: int32(v.SuspendDays), //nolint:gosec // validated ranges
		Notes: v.Notes, CreatedBy: v.CreatedBy,
	})
	if err != nil {
		return domain.Violation{}, fmt.Errorf("create violation: %w", err)
	}
	return toViolation(row), nil
}

func (r *Repository) GetViolation(ctx context.Context, tenantID, id uuid.UUID) (domain.Violation, bool, error) {
	row, err := r.queries(ctx).GetViolation(ctx, db.GetViolationParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Violation{}, false, nil
	}
	if err != nil {
		return domain.Violation{}, false, fmt.Errorf("get violation: %w", err)
	}
	return toViolation(row), true, nil
}

func (r *Repository) ListViolationsForMember(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Violation, error) {
	rows, err := r.queries(ctx).ListViolationsForMember(ctx, db.ListViolationsForMemberParams{TenantID: tenantID, MemberUserID: memberID})
	if err != nil {
		return nil, fmt.Errorf("list violations for member: %w", err)
	}
	return toViolations(rows), nil
}

func (r *Repository) ListViolations(ctx context.Context, tenantID uuid.UUID, status, kind string, limit, offset int) ([]domain.Violation, error) {
	params := db.ListViolationsParams{TenantID: tenantID, Limit: int32(limit), Offset: int32(offset)} //nolint:gosec // clamped
	if status != "" {
		params.Status = pdatabase.Text(status)
	}
	if kind != "" {
		params.Kind = pdatabase.Text(kind)
	}
	rows, err := r.queries(ctx).ListViolations(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list violations: %w", err)
	}
	return toViolations(rows), nil
}

func (r *Repository) SettleViolation(ctx context.Context, tenantID, id uuid.UUID, status domain.ViolationStatus, settledAt time.Time, settledBy uuid.UUID) (domain.Violation, bool, error) {
	row, err := r.queries(ctx).SettleViolation(ctx, db.SettleViolationParams{
		TenantID: tenantID, ID: id, Status: string(status), SettledAt: pdatabase.Timestamptz(settledAt),
		SettledBy: pdatabase.NullUUID(uuid.NullUUID{UUID: settledBy, Valid: true}),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Violation{}, false, nil
	}
	if err != nil {
		return domain.Violation{}, false, fmt.Errorf("settle violation: %w", err)
	}
	return toViolation(row), true, nil
}

func (r *Repository) HasUnpaidFine(ctx context.Context, tenantID, memberID uuid.UUID) (bool, error) {
	ok, err := r.queries(ctx).HasUnpaidFine(ctx, db.HasUnpaidFineParams{TenantID: tenantID, MemberUserID: memberID})
	if err != nil {
		return false, fmt.Errorf("has unpaid fine: %w", err)
	}
	return ok, nil
}

func (r *Repository) CountUnpaidViolations(ctx context.Context, tenantID, memberID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountUnpaidViolations(ctx, db.CountUnpaidViolationsParams{TenantID: tenantID, MemberUserID: memberID})
	if err != nil {
		return 0, fmt.Errorf("count unpaid violations: %w", err)
	}
	return int(n), nil
}
