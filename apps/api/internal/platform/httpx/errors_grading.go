package httpx

import "net/http"

var (
	ErrComponentNotFound   = NewError(http.StatusNotFound, "ASSESSMENT_COMPONENT_NOT_FOUND")
	ErrComponentCodeExists = NewError(http.StatusConflict, "ASSESSMENT_COMPONENT_CODE_EXISTS")
	ErrNotTeachingClass    = NewError(http.StatusForbidden, "NOT_TEACHING_THIS_CLASS")
	ErrGradesNotPublished  = NewError(http.StatusForbidden, "GRADES_NOT_PUBLISHED")
	ErrStarBalanceNegative = NewError(http.StatusConflict, "STAR_BALANCE_NEGATIVE")
	ErrNoActiveTerm        = NewError(http.StatusConflict, "NO_ACTIVE_TERM")
	ErrScoreOutOfRange     = NewError(http.StatusBadRequest, "SCORE_OUT_OF_RANGE")
	ErrNoGradableSubjects  = NewError(http.StatusBadRequest, "NO_GRADABLE_SUBJECTS")
)
