package domain

// The range a school may set attendance.correction_days to: at least the
// day after the lesson, at most a school term's worth of days.
const (
	MinCorrectionDays = 1
	MaxCorrectionDays = 90
)

// ValidateCorrectionDays refuses a correction window outside
// [MinCorrectionDays, MaxCorrectionDays].
func ValidateCorrectionDays(days int) error {
	if days < MinCorrectionDays || days > MaxCorrectionDays {
		return ErrInvalidCorrectionDays
	}
	return nil
}
