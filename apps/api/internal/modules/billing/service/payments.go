package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// PaymentInput is what the payment desk submits for one bill.
type PaymentInput struct {
	BillID      uuid.UUID
	AmountMinor int64
	Method      domain.PaymentMethod
	PaidOn      time.Time
	Reference   string
}

// RecordPayment writes one payment against a bill, recomputes the bill's
// paid amount and status, and issues a numbered receipt through the
// document pipeline, all inside one transaction: a payment is never left
// without a receipt, and a receipt failure (storage down, template
// broken) rolls the payment back rather than recording money received
// without proof of it. Partial payments are allowed; an amount that
// would exceed the bill's outstanding balance is refused by
// domain.ValidatePayment before anything is written.
func (s *Service) RecordPayment(ctx context.Context, tenantID uuid.UUID, in PaymentInput, receivedByUserID uuid.UUID) (domain.Payment, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return domain.Payment{}, err
	}
	if !in.Method.Valid() || in.PaidOn.IsZero() {
		return domain.Payment{}, domain.ErrInvalidInput
	}
	var out domain.Payment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		bill, ok, err := s.repo.GetBill(ctx, tenantID, in.BillID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrBillNotFound
		}
		if err := domain.ValidatePayment(bill, in.AmountMinor); err != nil {
			return err
		}
		payment := domain.Payment{
			ID: newID(), TenantID: tenantID, BillID: bill.ID, AmountMinor: in.AmountMinor, Method: in.Method,
			PaidOn: in.PaidOn, ReceivedByUserID: receivedByUserID, Reference: strings.TrimSpace(in.Reference),
		}
		out, err = s.repo.CreatePayment(ctx, payment)
		if err != nil {
			return err
		}
		if err := audit.Record(ctx, tenantID, "payment.record", "payment", out.ID, nil, map[string]any{
			"bill_id": out.BillID, "amount_minor": out.AmountMinor, "method": out.Method,
			"paid_on": out.PaidOn, "reference": out.Reference,
		}); err != nil {
			return err
		}
		if err := s.recomputeBill(ctx, tenantID, bill); err != nil {
			return err
		}
		return s.issueReceipt(ctx, tenantID, yearID, receivedByUserID, bill, out, &out)
	})
	if err != nil {
		return domain.Payment{}, err
	}
	return out, nil
}

// recomputeBill reloads a bill's non-voided payments and persists the
// derived paid amount and status. Called inside the same transaction as
// every payment insert or void, per domain.RecomputeBillPayments's doc
// comment.
func (s *Service) recomputeBill(ctx context.Context, tenantID uuid.UUID, bill domain.Bill) error {
	payments, err := s.repo.ListPaymentsForBill(ctx, tenantID, bill.ID)
	if err != nil {
		return err
	}
	updated := domain.RecomputeBillPayments(bill, payments)
	return s.repo.UpdateBillPayment(ctx, tenantID, bill.ID, updated.PaidAmountMinor, updated.Status)
}

// issueReceipt renders and numbers the receipt PDF and writes its number
// and asset onto out. Called from inside RecordPayment's transaction, so
// a rendering or storage failure rolls the payment back with it instead
// of leaving money recorded with no proof of it.
func (s *Service) issueReceipt(ctx context.Context, tenantID, yearID, issuerID uuid.UUID, bill domain.Bill, payment domain.Payment, out *domain.Payment) error {
	if s.docs == nil {
		return nil
	}
	display, err := s.repo.StudentDisplay(ctx, tenantID, bill.StudentUserID, yearID)
	if err != nil {
		return err
	}
	issued, err := s.docs.IssueReceipt(ctx, tenantID, ReceiptDocument{
		PaymentID: payment.ID, AcademicYearID: yearID, IssuerUserID: issuerID,
		Vars: receiptVars(display, bill, payment),
	})
	if err != nil {
		return err
	}
	if err := s.repo.SetPaymentReceipt(ctx, tenantID, payment.ID, issued.Number, issued.AssetID); err != nil {
		return err
	}
	out.ReceiptNumber, out.ReceiptAssetID = issued.Number, issued.AssetID
	return nil
}

// receiptVars is what the receipt template prints, already formatted for
// a reader: the amount as "Rp 75.000", a monthly period as its month
// ("November 2026"; a one-off period as the label the admin typed), the
// method and date in Indonesian. The receipt is an Indonesian document,
// so it is formatted for the "id" locale whatever the issuer's UI
// language.
func receiptVars(display StudentDisplay, bill domain.Bill, payment domain.Payment) map[string]any {
	return map[string]any{
		"student_name": display.StudentName, "class_name": display.ClassName, "guardian_name": display.GuardianName,
		"fee_type_name": bill.FeeTypeName, "period": receiptPeriod(bill.Period),
		"amount": receiptAmount(bill.Currency, payment.AmountMinor), "amount_minor": payment.AmountMinor,
		"method": payment.Method.ReceiptLabel(), "paid_on": reportdoc.FormatDate(reportdoc.LocaleID, payment.PaidOn),
		"reference": payment.Reference,
	}
}

// receiptAmount prints a whole-unit amount with Indonesian digit
// grouping, prefixed "Rp" for rupiah and the currency code otherwise
// (see the domain package doc: one minor unit is one rupiah).
func receiptAmount(currency string, amountMinor int64) string {
	prefix := currency
	if currency == "" || currency == "IDR" {
		prefix = "Rp"
	}
	return prefix + " " + reportdoc.FormatInteger(reportdoc.LocaleID, amountMinor)
}

// receiptPeriod prints a monthly period key ("2026-11") as its month and
// any other period (a one-off fee's own label) unchanged, the same rule
// the web's formatBillPeriod follows.
func receiptPeriod(period string) string {
	if t, err := time.Parse("2006-01", period); err == nil {
		return reportdoc.FormatMonth(reportdoc.LocaleID, t)
	}
	return period
}

// VoidPayment reverses a payment without deleting it: the row keeps who
// voided it, when, and why, and the bill's paid amount and status are
// recomputed to no longer count it. The payment's receipt is revoked in
// the same transaction, so its verification code stops reporting a
// cancelled payment as genuine.
func (s *Service) VoidPayment(ctx context.Context, tenantID, paymentID, actorUserID uuid.UUID, reason string) (domain.Payment, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return domain.Payment{}, err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return domain.Payment{}, domain.ErrInvalidInput
	}
	var out domain.Payment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetPayment(ctx, tenantID, paymentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrPaymentNotFound
		}
		if current.IsVoided() {
			return domain.ErrPaymentAlreadyVoided
		}
		out, _, err = s.repo.VoidPayment(ctx, tenantID, paymentID, actorUserID, reason)
		if err != nil {
			return err
		}
		if err := audit.Record(ctx, tenantID, "payment.void", "payment", paymentID, current, out); err != nil {
			return err
		}
		if s.docs != nil {
			if err := s.docs.RevokeReceipt(ctx, tenantID, paymentID); err != nil {
				return err
			}
		}
		bill, ok, err := s.repo.GetBill(ctx, tenantID, current.BillID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrBillNotFound
		}
		return s.recomputeBill(ctx, tenantID, bill)
	})
	return out, err
}

// ReceiptURL presigns the stored receipt PDF for a payment. A voided
// payment's receipt is refused with ErrReceiptRevoked: the stored PDF
// carries no cancellation mark, so handing it out again would pass it
// off as valid to anyone who does not scan its verification code.
func (s *Service) ReceiptURL(ctx context.Context, tenantID, paymentID uuid.UUID) (string, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return "", err
	}
	var payment domain.Payment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		p, ok, err := s.repo.GetPayment(ctx, tenantID, paymentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrPaymentNotFound
		}
		payment = p
		return nil
	})
	if err != nil {
		return "", err
	}
	if payment.IsVoided() {
		return "", domain.ErrReceiptRevoked
	}
	if !payment.ReceiptAssetID.Valid || s.docs == nil {
		return "", domain.ErrPaymentNotFound
	}
	return s.docs.DocumentURL(ctx, tenantID, payment.ReceiptAssetID.UUID)
}

// BuiltinReceiptHTML is the template used until a school uploads its own
// under document_templates (kind receipt is a billing-specific kind
// reached only through this module's own wiring adapter, never written
// to document_templates by this slice; see the module's report for why).
const BuiltinReceiptHTML = `<html><body style="font-family: sans-serif; font-size: 12pt; margin: 40px;">
<h2 style="text-align:center; margin-bottom: 4px;">KWITANSI PEMBAYARAN</h2>
<p style="text-align:center; margin-top:0;">Nomor: {{.letter_number}}</p>
<table>
<tr><td>Nama Siswa</td><td>: {{.student_name}}</td></tr>
<tr><td>Kelas</td><td>: {{.class_name}}</td></tr>
<tr><td>Wali</td><td>: {{.guardian_name}}</td></tr>
<tr><td>Tanggal bayar</td><td>: {{.paid_on}}</td></tr>
<tr><td>Metode</td><td>: {{.method}}</td></tr>
{{if .reference}}<tr><td>Referensi</td><td>: {{.reference}}</td></tr>{{end}}
</table>
<table border="1" cellpadding="4" cellspacing="0" style="margin-top: 16px; width: 100%;">
<tr><th>Jenis Biaya</th><th>Periode</th><th style="text-align:right;">Jumlah</th></tr>
<tr><td>{{.fee_type_name}}</td><td>{{.period}}</td><td style="text-align:right;">{{.amount}}</td></tr>
</table>
<p>Kwitansi diterbitkan pada {{.issued_at}}. Kode verifikasi: <strong>{{.verification_code}}</strong></p>
</body></html>`
