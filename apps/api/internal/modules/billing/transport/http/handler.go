// Package http adapts the generated strict-server interface to the
// billing service.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type BillingHandler struct{ service *service.Service }

func New(svc *service.Service) *BillingHandler { return &BillingHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	domain.ErrModuleDisabled:            httpx.ErrBillingModuleDisabled,
	domain.ErrNoActiveAcademicYear:      httpx.ErrValidation,
	domain.ErrInvalidInput:              httpx.ErrValidation,
	domain.ErrFeeTypeNotFound:           httpx.ErrFeeTypeNotFound,
	domain.ErrFeeTypeInactive:           httpx.ErrValidation,
	domain.ErrDiscountNotFound:          httpx.ErrDiscountNotFound,
	domain.ErrBillNotFound:              httpx.ErrBillNotFound,
	domain.ErrBillAlreadyPaid:           httpx.ErrBillAlreadyPaid,
	domain.ErrPaymentNotFound:           httpx.ErrPaymentNotFound,
	domain.ErrPaymentAlreadyVoided:      httpx.ErrPaymentAlreadyVoided,
	domain.ErrPaymentExceedsOutstanding: httpx.ErrPaymentExceedsOutstanding,
}

func mapError(err error) error {
	for d, h := range errorMap {
		if errors.Is(err, d) {
			return h
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

// Fee types.

func (h *BillingHandler) ListFeeTypes(ctx context.Context, request api.ListFeeTypesRequestObject) (api.ListFeeTypesResponseObject, error) {
	includeInactive := request.Params.IncludeInactive != nil && *request.Params.IncludeInactive
	types, err := h.service.ListFeeTypes(ctx, tenantID(ctx), includeInactive)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListFeeTypes200JSONResponse{Data: toAPIFeeTypes(types)}, nil
}

func (h *BillingHandler) GetFeeType(ctx context.Context, request api.GetFeeTypeRequestObject) (api.GetFeeTypeResponseObject, error) {
	t, err := h.service.GetFeeType(ctx, tenantID(ctx), request.FeeTypeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetFeeType200JSONResponse(toAPIFeeType(t)), nil
}

func (h *BillingHandler) CreateFeeType(ctx context.Context, request api.CreateFeeTypeRequestObject) (api.CreateFeeTypeResponseObject, error) {
	t := feeTypeFromWrite(*request.Body)
	t.TenantID = tenantID(ctx)
	created, err := h.service.CreateFeeType(ctx, t, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateFeeType201JSONResponse(toAPIFeeType(created)), nil
}

func (h *BillingHandler) UpdateFeeType(ctx context.Context, request api.UpdateFeeTypeRequestObject) (api.UpdateFeeTypeResponseObject, error) {
	t := feeTypeFromWrite(*request.Body)
	t.TenantID, t.ID = tenantID(ctx), request.FeeTypeId
	updated, err := h.service.UpdateFeeType(ctx, t, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateFeeType200JSONResponse(toAPIFeeType(updated)), nil
}

func (h *BillingHandler) DeleteFeeType(ctx context.Context, request api.DeleteFeeTypeRequestObject) (api.DeleteFeeTypeResponseObject, error) {
	if err := h.service.DeleteFeeType(ctx, tenantID(ctx), request.FeeTypeId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteFeeType204Response{}, nil
}

func (h *BillingHandler) ListFeeTypeDiscounts(ctx context.Context, request api.ListFeeTypeDiscountsRequestObject) (api.ListFeeTypeDiscountsResponseObject, error) {
	discounts, err := h.service.ListDiscountsForFeeType(ctx, tenantID(ctx), request.FeeTypeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListFeeTypeDiscounts200JSONResponse{Data: toAPIDiscounts(discounts)}, nil
}

func (h *BillingHandler) ListStudentDiscounts(ctx context.Context, request api.ListStudentDiscountsRequestObject) (api.ListStudentDiscountsResponseObject, error) {
	discounts, err := h.service.ListDiscountsForStudent(ctx, tenantID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListStudentDiscounts200JSONResponse{Data: toAPIDiscounts(discounts)}, nil
}

// Discounts.

func (h *BillingHandler) CreateDiscount(ctx context.Context, request api.CreateDiscountRequestObject) (api.CreateDiscountResponseObject, error) {
	d := discountFromWrite(*request.Body)
	d.TenantID = tenantID(ctx)
	created, err := h.service.CreateDiscount(ctx, d, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateDiscount201JSONResponse(toAPIDiscount(created)), nil
}

func (h *BillingHandler) UpdateDiscount(ctx context.Context, request api.UpdateDiscountRequestObject) (api.UpdateDiscountResponseObject, error) {
	d := discountFromWrite(*request.Body)
	d.TenantID, d.ID = tenantID(ctx), request.DiscountId
	updated, err := h.service.UpdateDiscount(ctx, d)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateDiscount200JSONResponse(toAPIDiscount(updated)), nil
}

func (h *BillingHandler) DeleteDiscount(ctx context.Context, request api.DeleteDiscountRequestObject) (api.DeleteDiscountResponseObject, error) {
	if err := h.service.DeleteDiscount(ctx, tenantID(ctx), request.DiscountId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteDiscount204Response{}, nil
}

// Generation.

func (h *BillingHandler) PreviewBillGeneration(ctx context.Context, request api.PreviewBillGenerationRequestObject) (api.PreviewBillGenerationResponseObject, error) {
	summary, err := h.service.PreviewGeneration(ctx, tenantID(ctx), request.Body.Period)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PreviewBillGeneration200JSONResponse(toAPISummary(summary)), nil
}

func (h *BillingHandler) RunBillGeneration(ctx context.Context, request api.RunBillGenerationRequestObject) (api.RunBillGenerationResponseObject, error) {
	summary, err := h.service.GenerateBills(ctx, tenantID(ctx), userID(ctx), request.Body.Period)
	if err != nil {
		return nil, mapError(err)
	}
	return api.RunBillGeneration200JSONResponse(toAPISummary(summary)), nil
}

// Bills.

func (h *BillingHandler) ListBills(ctx context.Context, request api.ListBillsRequestObject) (api.ListBillsResponseObject, error) {
	p := request.Params
	f := service.BillFilter{Period: strOr(p.Period), Limit: intOr(p.Limit, 50), Offset: intOr(p.Offset, 0)}
	if p.Status != nil {
		f.Status = domain.BillStatus(*p.Status)
	}
	if p.ClassId != nil {
		f.ClassID = uuid.NullUUID{UUID: *p.ClassId, Valid: true}
	}
	bills, err := h.service.ListBills(ctx, tenantID(ctx), f)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListBills200JSONResponse{Data: toAPIBills(bills)}, nil
}

func (h *BillingHandler) GetBill(ctx context.Context, request api.GetBillRequestObject) (api.GetBillResponseObject, error) {
	bill, err := h.service.GetBill(ctx, tenantID(ctx), request.BillId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetBill200JSONResponse(toAPIBill(bill)), nil
}

func (h *BillingHandler) GetStudentBillHistory(ctx context.Context, request api.GetStudentBillHistoryRequestObject) (api.GetStudentBillHistoryResponseObject, error) {
	history, err := h.service.StudentBillHistory(ctx, tenantID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStudentBillHistory200JSONResponse(toAPIHistory(history)), nil
}

// Payments.

func (h *BillingHandler) RecordPayment(ctx context.Context, request api.RecordPaymentRequestObject) (api.RecordPaymentResponseObject, error) {
	b := request.Body
	payment, err := h.service.RecordPayment(ctx, tenantID(ctx), service.PaymentInput{
		BillID: b.BillId, AmountMinor: b.AmountMinor, Method: domain.PaymentMethod(b.Method), PaidOn: b.PaidOn.Time, Reference: strOr(b.Reference),
	}, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RecordPayment201JSONResponse(toAPIPayment(payment)), nil
}

func (h *BillingHandler) VoidPayment(ctx context.Context, request api.VoidPaymentRequestObject) (api.VoidPaymentResponseObject, error) {
	payment, err := h.service.VoidPayment(ctx, tenantID(ctx), request.PaymentId, userID(ctx), request.Body.Reason)
	if err != nil {
		return nil, mapError(err)
	}
	return api.VoidPayment200JSONResponse(toAPIPayment(payment)), nil
}

func (h *BillingHandler) GetPaymentReceiptUrl(ctx context.Context, request api.GetPaymentReceiptUrlRequestObject) (api.GetPaymentReceiptUrlResponseObject, error) {
	url, err := h.service.ReceiptURL(ctx, tenantID(ctx), request.PaymentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetPaymentReceiptUrl200JSONResponse{Url: url}, nil
}

// Arrears.

func (h *BillingHandler) GetArrearsReport(ctx context.Context, _ api.GetArrearsReportRequestObject) (api.GetArrearsReportResponseObject, error) {
	report, err := h.service.ArrearsReport(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetArrearsReport200JSONResponse(toAPIArrears(report)), nil
}
