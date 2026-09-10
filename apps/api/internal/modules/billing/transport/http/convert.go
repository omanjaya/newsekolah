package http

import (
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
)

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func intOr(p *int, def int) int {
	if p == nil {
		return def
	}
	return *p
}

func uuidPtr(n uuid.NullUUID) *openapi_types.UUID {
	if !n.Valid {
		return nil
	}
	id := openapi_types.UUID(n.UUID)
	return &id
}

func toAPIFeeType(t domain.FeeType) api.FeeType {
	out := api.FeeType{
		Id: t.ID, Name: t.Name, AmountMinor: t.AmountMinor, Currency: t.Currency,
		Recurrence: api.Recurrence(t.Recurrence), IsActive: t.IsActive,
	}
	if t.Description != "" {
		out.Description = strPtr(t.Description)
	}
	if t.Period != "" {
		out.Period = strPtr(t.Period)
	}
	return out
}

func toAPIFeeTypes(types []domain.FeeType) []api.FeeType {
	out := make([]api.FeeType, len(types))
	for i, t := range types {
		out[i] = toAPIFeeType(t)
	}
	return out
}

func feeTypeFromWrite(b api.FeeTypeWrite) domain.FeeType {
	return domain.FeeType{
		Name: b.Name, Description: strOr(b.Description), AmountMinor: b.AmountMinor, Currency: strOr(b.Currency),
		Recurrence: domain.Recurrence(b.Recurrence), Period: strOr(b.Period), IsActive: b.IsActive == nil || *b.IsActive,
	}
}

func toAPIDiscount(d domain.Discount) api.Discount {
	out := api.Discount{
		Id: d.ID, FeeTypeId: d.FeeTypeID, StudentUserId: d.StudentUserID, Kind: api.DiscountKind(d.Kind),
		Reason: d.Reason, IsActive: d.IsActive,
	}
	if d.PercentageBp > 0 {
		bp := d.PercentageBp
		out.PercentageBp = &bp
	}
	if d.AmountMinor > 0 {
		amount := d.AmountMinor
		out.AmountMinor = &amount
	}
	return out
}

func toAPIDiscounts(discounts []domain.Discount) []api.Discount {
	out := make([]api.Discount, len(discounts))
	for i, d := range discounts {
		out[i] = toAPIDiscount(d)
	}
	return out
}

func discountFromWrite(b api.DiscountWrite) domain.Discount {
	d := domain.Discount{
		FeeTypeID: b.FeeTypeId, StudentUserID: b.StudentUserId, Kind: domain.DiscountKind(b.Kind), Reason: b.Reason,
	}
	if b.PercentageBp != nil {
		d.PercentageBp = *b.PercentageBp
	}
	if b.AmountMinor != nil {
		d.AmountMinor = *b.AmountMinor
	}
	if b.IsActive != nil {
		d.IsActive = *b.IsActive
	} else {
		d.IsActive = true
	}
	return d
}

func toAPIBill(b domain.Bill) api.Bill {
	return api.Bill{
		Id: b.ID, StudentUserId: b.StudentUserID, FeeTypeId: b.FeeTypeID, FeeTypeName: b.FeeTypeName, Currency: b.Currency,
		Period: b.Period, DueDate: openapi_types.Date{Time: b.DueDate}, OriginalAmountMinor: b.OriginalAmountMinor,
		DiscountAmountMinor: b.DiscountAmountMinor, AmountMinor: b.AmountMinor, PaidAmountMinor: b.PaidAmountMinor,
		Status: api.BillStatus(b.Status), GeneratedAt: b.GeneratedAt,
	}
}

func toAPIBills(bills []domain.Bill) []api.Bill {
	out := make([]api.Bill, len(bills))
	for i, b := range bills {
		out[i] = toAPIBill(b)
	}
	return out
}

// toAPISummary converts a GenerationSummary for either preview or an
// actual run: both build service.GenerationSummary the same way (see
// service/generation.go), so one conversion covers both.
func toAPISummary(summary service.GenerationSummary) api.GenerationSummary {
	created := make([]api.BillCandidate, len(summary.Created))
	for i, b := range summary.Created {
		created[i] = api.BillCandidate{
			StudentUserId: b.StudentUserID, FeeTypeId: b.FeeTypeID, FeeTypeName: b.FeeTypeName, Period: b.Period,
			OriginalAmountMinor: b.OriginalAmountMinor, DiscountAmountMinor: b.DiscountAmountMinor, AmountMinor: b.AmountMinor,
		}
	}
	return api.GenerationSummary{Created: created, Skipped: summary.Skipped}
}

func toAPIPayment(p domain.Payment) api.Payment {
	out := api.Payment{
		Id: p.ID, BillId: p.BillID, AmountMinor: p.AmountMinor, Method: api.PaymentMethod(p.Method),
		PaidOn: openapi_types.Date{Time: p.PaidOn}, ReceivedByUserId: p.ReceivedByUserID, CreatedAt: p.CreatedAt,
		IsVoided: p.IsVoided(), Reference: strPtr(p.Reference), ReceiptNumber: strPtr(p.ReceiptNumber),
		VoidedAt: p.VoidedAt, VoidReason: strPtr(p.VoidReason),
	}
	hasReceipt := p.ReceiptAssetID.Valid
	out.HasReceipt = &hasReceipt
	return out
}

func toAPIPayments(payments []domain.Payment) []api.Payment {
	out := make([]api.Payment, len(payments))
	for i, p := range payments {
		out[i] = toAPIPayment(p)
	}
	return out
}

func toAPIHistory(h service.StudentHistory) api.StudentBillHistory {
	entries := make([]api.StudentBillHistoryEntry, len(h.Bills))
	for i, b := range h.Bills {
		entries[i] = api.StudentBillHistoryEntry{Bill: toAPIBill(b), Payments: toAPIPayments(h.Payments[b.ID])}
	}
	return api.StudentBillHistory{Data: entries}
}

func toAPIArrears(report service.ArrearsReport) api.ArrearsReport {
	byStudent := make([]api.ArrearsStudentLine, len(report.ByStudent))
	for i, l := range report.ByStudent {
		byStudent[i] = api.ArrearsStudentLine{
			StudentUserId: l.StudentUserID, ClassId: uuidPtr(l.ClassID), OutstandingMinor: l.OutstandingMinor, BillCount: l.BillCount,
		}
	}
	byClass := make([]api.ArrearsClassLine, len(report.ByClass))
	for i, c := range report.ByClass {
		classID := uuid.NullUUID{UUID: c.ClassID.UUID, Valid: c.ClassID.Valid}
		byClass[i] = api.ArrearsClassLine{ClassId: uuidPtr(classID), OutstandingMinor: c.OutstandingMinor, StudentCount: c.StudentCount}
	}
	return api.ArrearsReport{ByStudent: byStudent, ByClass: byClass}
}
