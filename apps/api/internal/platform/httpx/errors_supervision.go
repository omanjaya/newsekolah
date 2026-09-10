package httpx

import "net/http"

var (
	ErrSupervisionCycleNotFound        = NewError(http.StatusNotFound, "SUPERVISION_CYCLE_NOT_FOUND")
	ErrSupervisionInstrumentInvalid    = NewError(http.StatusBadRequest, "SUPERVISION_INSTRUMENT_INVALID")
	ErrSupervisionScheduledNotFound    = NewError(http.StatusNotFound, "SUPERVISION_SCHEDULED_NOT_FOUND")
	ErrSupervisionScheduledAlreadyDone = NewError(http.StatusConflict, "SUPERVISION_SCHEDULED_ALREADY_DONE")
	ErrSupervisionObservationNotFound  = NewError(http.StatusNotFound, "SUPERVISION_OBSERVATION_NOT_FOUND")
	ErrSupervisionObservationForbidden = NewError(http.StatusForbidden, "SUPERVISION_OBSERVATION_FORBIDDEN")
	ErrSupervisionScoreMismatch        = NewError(http.StatusBadRequest, "SUPERVISION_SCORE_COUNT_MISMATCH")
	ErrSupervisionScoreOutOfRange      = NewError(http.StatusBadRequest, "SUPERVISION_SCORE_OUT_OF_RANGE")
	ErrSupervisionLessonNotResolved    = NewError(http.StatusBadRequest, "SUPERVISION_LESSON_NOT_RESOLVED")
	ErrSupervisionModuleDisabled       = NewError(http.StatusForbidden, "SUPERVISION_MODULE_DISABLED")
)
