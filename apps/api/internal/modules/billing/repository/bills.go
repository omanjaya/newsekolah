package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toBill(row db.Bill) domain.Bill {
	return domain.Bill{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID,
		FeeTypeID: row.FeeTypeID, FeeTypeName: row.FeeTypeName, Currency: row.Currency, Period: row.Period,
		DueDate: pdatabase.DateOrZero(row.DueDate), OriginalAmountMinor: row.OriginalAmountMinor,
		DiscountAmountMinor: row.DiscountAmountMinor, AmountMinor: row.AmountMinor, PaidAmountMinor: row.PaidAmountMinor,
		Status: domain.BillStatus(row.Status), GeneratedAt: pdatabase.TimeOrZero(row.GeneratedAt),
		GeneratedBy: pdatabase.UUIDOrNil(row.GeneratedBy),
	}
}

func (r *Repository) ExistingBillKeys(ctx context.Context, tenantID uuid.UUID, feeTypeIDs []uuid.UUID, period string) (map[domain.BillKey]bool, error) {
	if len(feeTypeIDs) == 0 {
		return map[domain.BillKey]bool{}, nil
	}
	rows, err := r.queries(ctx).ListBillKeysForPeriod(ctx, db.ListBillKeysForPeriodParams{TenantID: tenantID, Period: period, FeeTypeIds: feeTypeIDs})
	if err != nil {
		return nil, fmt.Errorf("list existing bill keys: %w", err)
	}
	out := make(map[domain.BillKey]bool, len(rows))
	for _, row := range rows {
		out[domain.BillKey{FeeTypeID: row.FeeTypeID, StudentUserID: row.StudentUserID, Period: period}] = true
	}
	return out, nil
}

// CreateBills inserts each candidate bill one at a time inside the
// caller's transaction, relying on "on conflict do nothing" for
// per-row idempotency (see queries/bills.sql). Returns only the rows
// that were actually inserted; a bill whose key already existed is
// silently skipped, which the service reports as GenerationSummary.Skipped.
func (r *Repository) CreateBills(ctx context.Context, bills []domain.Bill) ([]domain.Bill, error) {
	out := make([]domain.Bill, 0, len(bills))
	for _, b := range bills {
		row, err := r.queries(ctx).CreateBill(ctx, db.CreateBillParams{
			ID: b.ID, TenantID: b.TenantID, AcademicYearID: b.AcademicYearID, StudentUserID: b.StudentUserID,
			FeeTypeID: b.FeeTypeID, FeeTypeName: b.FeeTypeName, Currency: b.Currency, Period: b.Period,
			DueDate: pdatabase.Date(b.DueDate), OriginalAmountMinor: b.OriginalAmountMinor, DiscountAmountMinor: b.DiscountAmountMinor,
			AmountMinor: b.AmountMinor, Status: string(b.Status), GeneratedBy: pdatabase.NullUUID(b.GeneratedBy),
		})
		if errors.Is(err, pgx.ErrNoRows) {
			continue // key already billed for this period; not an error
		}
		if err != nil {
			return nil, fmt.Errorf("create bill: %w", err)
		}
		out = append(out, toBill(row))
	}
	return out, nil
}

func (r *Repository) ListBills(ctx context.Context, tenantID, yearID uuid.UUID, f service.BillFilter) ([]domain.Bill, error) {
	rows, err := r.queries(ctx).ListBills(ctx, db.ListBillsParams{
		TenantID: tenantID, AcademicYearID: yearID, Period: pdatabase.Text(f.Period), Status: pdatabase.Text(string(f.Status)),
		ClassID: pdatabase.NullUUID(f.ClassID), PageLimit: int32(f.Limit), PageOffset: int32(f.Offset), //nolint:gosec // bounded by the service's 200 cap
	})
	if err != nil {
		return nil, fmt.Errorf("list bills: %w", err)
	}
	out := make([]domain.Bill, len(rows))
	for i, row := range rows {
		out[i] = toBill(row)
	}
	return out, nil
}

func (r *Repository) GetBill(ctx context.Context, tenantID, id uuid.UUID) (domain.Bill, bool, error) {
	row, err := r.queries(ctx).GetBill(ctx, db.GetBillParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Bill{}, false, nil
	}
	if err != nil {
		return domain.Bill{}, false, fmt.Errorf("get bill: %w", err)
	}
	return toBill(row), true, nil
}

func (r *Repository) ListBillsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.Bill, error) {
	rows, err := r.queries(ctx).ListBillsForStudent(ctx, db.ListBillsForStudentParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list bills for student: %w", err)
	}
	out := make([]domain.Bill, len(rows))
	for i, row := range rows {
		out[i] = toBill(row)
	}
	return out, nil
}

func (r *Repository) ListOutstandingBills(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Bill, error) {
	rows, err := r.queries(ctx).ListOutstandingBills(ctx, db.ListOutstandingBillsParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, fmt.Errorf("list outstanding bills: %w", err)
	}
	out := make([]domain.Bill, len(rows))
	for i, row := range rows {
		out[i] = toBill(row)
	}
	return out, nil
}

func (r *Repository) UpdateBillPayment(ctx context.Context, tenantID, billID uuid.UUID, paidMinor int64, status domain.BillStatus) error {
	if err := r.queries(ctx).UpdateBillPayment(ctx, db.UpdateBillPaymentParams{
		TenantID: tenantID, ID: billID, PaidAmountMinor: paidMinor, Status: string(status),
	}); err != nil {
		return fmt.Errorf("update bill payment: %w", err)
	}
	return nil
}
