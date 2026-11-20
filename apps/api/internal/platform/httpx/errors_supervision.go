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
	ErrSupervisionLessonDayMismatch    = NewError(http.StatusUnprocessableEntity, "SUPERVISION_LESSON_DAY_MISMATCH")
	ErrSupervisionLessonNotOnDate      = NewError(http.StatusUnprocessableEntity, "SUPERVISION_LESSON_NOT_ON_DATE").
						WithDetails(ErrorDetail{Field: "lesson_date", Code: "NOT_ON_TIMETABLE"})
	ErrSupervisionScheduledExists    = NewError(http.StatusConflict, "SUPERVISION_SCHEDULED_EXISTS")
	ErrSupervisionCriterionKeyTaken  = NewError(http.StatusBadRequest, "SUPERVISION_CRITERION_KEY_DUPLICATE")
	ErrSupervisionCriterionNameTaken = NewError(http.StatusBadRequest, "SUPERVISION_CRITERION_NAME_DUPLICATE")
	ErrSupervisionModuleDisabled     = NewError(http.StatusForbidden, "SUPERVISION_MODULE_DISABLED")
)
