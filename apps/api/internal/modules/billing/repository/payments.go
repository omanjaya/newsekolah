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

func toPayment(row db.Payment) domain.Payment {
	return domain.Payment{
		ID: row.ID, TenantID: row.TenantID, BillID: row.BillID, AmountMinor: row.AmountMinor,
		Method: domain.PaymentMethod(row.Method), PaidOn: pdatabase.DateOrZero(row.PaidOn), ReceivedByUserID: row.ReceivedBy,
		Reference: row.Reference, ReceiptNumber: pdatabase.TextOrEmpty(row.ReceiptNumber), ReceiptAssetID: pdatabase.UUIDOrNil(row.ReceiptAssetID),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), VoidedAt: pdatabase.TimePtr(row.VoidedAt),
		VoidedByUserID: pdatabase.UUIDOrNil(row.VoidedBy), VoidReason: pdatabase.TextOrEmpty(row.VoidReason),
	}
}

func (r *Repository) CreatePayment(ctx context.Context, p domain.Payment) (domain.Payment, error) {
	row, err := r.queries(ctx).CreatePayment(ctx, db.CreatePaymentParams{
		ID: p.ID, TenantID: p.TenantID, BillID: p.BillID, AmountMinor: p.AmountMinor, Method: string(p.Method),
		PaidOn: pdatabase.Date(p.PaidOn), ReceivedBy: p.ReceivedByUserID, Reference: p.Reference,
	})
	if err != nil {
		return domain.Payment{}, fmt.Errorf("create payment: %w", err)
	}
	return toPayment(row), nil
}

func (r *Repository) GetPayment(ctx context.Context, tenantID, id uuid.UUID) (domain.Payment, bool, error) {
	row, err := r.queries(ctx).GetPayment(ctx, db.GetPaymentParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Payment{}, false, nil
	}
	if err != nil {
		return domain.Payment{}, false, fmt.Errorf("get payment: %w", err)
	}
	return toPayment(row), true, nil
}

func (r *Repository) ListPaymentsForBill(ctx context.Context, tenantID, billID uuid.UUID) ([]domain.Payment, error) {
	rows, err := r.queries(ctx).ListPaymentsForBill(ctx, db.ListPaymentsForBillParams{TenantID: tenantID, BillID: billID})
	if err != nil {
		return nil, fmt.Errorf("list payments for bill: %w", err)
	}
	out := make([]domain.Payment, len(rows))
	for i, row := range rows {
		out[i] = toPayment(row)
	}
	return out, nil
}

func (r *Repository) VoidPayment(ctx context.Context, tenantID, id, voidedBy uuid.UUID, reason string) (domain.Payment, bool, error) {
	row, err := r.queries(ctx).VoidPayment(ctx, db.VoidPaymentParams{
		TenantID: tenantID, ID: id, VoidedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: voidedBy, Valid: true}), VoidReason: pdatabase.Text(reason),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Payment{}, false, nil
	}
	if err != nil {
		return domain.Payment{}, false, fmt.Errorf("void payment: %w", err)
	}
	return toPayment(row), true, nil
}

func (r *Repository) SetPaymentReceipt(ctx context.Context, tenantID, paymentID uuid.UUID, number string, assetID uuid.NullUUID) error {
	if err := r.queries(ctx).SetPaymentReceipt(ctx, db.SetPaymentReceiptParams{
		TenantID: tenantID, ID: paymentID, ReceiptNumber: pdatabase.Text(number), ReceiptAssetID: pdatabase.NullUUID(assetID),
	}); err != nil {
		return fmt.Errorf("set payment receipt: %w", err)
	}
	return nil
}
