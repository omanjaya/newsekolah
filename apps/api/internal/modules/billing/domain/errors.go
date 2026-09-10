package domain

import "errors"

var (
	ErrInvalidInput              = errors.New("invalid input")
	ErrNoActiveAcademicYear      = errors.New("no active academic year")
	ErrFeeTypeNotFound           = errors.New("fee type not found")
	ErrFeeTypeInactive           = errors.New("fee type is inactive")
	ErrDiscountNotFound          = errors.New("discount not found")
	ErrBillNotFound              = errors.New("bill not found")
	ErrBillAlreadyPaid           = errors.New("bill is already fully paid")
	ErrPaymentNotFound           = errors.New("payment not found")
	ErrPaymentAlreadyVoided      = errors.New("payment already voided")
	ErrPaymentExceedsOutstanding = errors.New("payment exceeds the bill's outstanding balance")
	ErrModuleDisabled            = errors.New("billing module is disabled for this tenant")
)
