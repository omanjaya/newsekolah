package httpx

import "net/http"

var (
	ErrBillingModuleDisabled     = NewError(http.StatusNotFound, "BILLING_MODULE_DISABLED")
	ErrFeeTypeNotFound           = NewError(http.StatusNotFound, "FEE_TYPE_NOT_FOUND")
	ErrDiscountNotFound          = NewError(http.StatusNotFound, "DISCOUNT_NOT_FOUND")
	ErrBillNotFound              = NewError(http.StatusNotFound, "BILL_NOT_FOUND")
	ErrBillAlreadyPaid           = NewError(http.StatusConflict, "BILL_ALREADY_PAID")
	ErrPaymentNotFound           = NewError(http.StatusNotFound, "PAYMENT_NOT_FOUND")
	ErrPaymentAlreadyVoided      = NewError(http.StatusConflict, "PAYMENT_ALREADY_VOIDED")
	ErrPaymentExceedsOutstanding = NewError(http.StatusConflict, "PAYMENT_EXCEEDS_OUTSTANDING")
)
