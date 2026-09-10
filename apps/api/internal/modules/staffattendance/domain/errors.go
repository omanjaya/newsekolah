package domain

import "errors"

var (
	ErrRecordNotFound           = errors.New("staff attendance record not found")
	ErrScheduleDayInvalid       = errors.New("work schedule day is invalid")
	ErrCorrectionReasonRequired = errors.New("correcting a record requires a reason")
	ErrInvalidMonth             = errors.New("month must be in YYYY-MM format")
	ErrNoActiveAcademicYear     = errors.New("tenant has no active academic year")
	ErrModuleDisabled           = errors.New("staff attendance module is disabled for this tenant")
	ErrAlreadyScannedBothWays   = errors.New("employee has already scanned both arrival and departure for this date")
)
