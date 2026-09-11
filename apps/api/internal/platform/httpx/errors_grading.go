package httpx

import "net/http"

var (
	ErrComponentNotFound     = NewError(http.StatusNotFound, "ASSESSMENT_COMPONENT_NOT_FOUND")
	ErrComponentCodeExists   = NewError(http.StatusConflict, "ASSESSMENT_COMPONENT_CODE_EXISTS")
	ErrComponentHasGrades    = NewError(http.StatusConflict, "ASSESSMENT_COMPONENT_HAS_GRADES")
	ErrNotTeachingClass      = NewError(http.StatusForbidden, "NOT_TEACHING_THIS_CLASS")
	ErrGradesNotPublished    = NewError(http.StatusForbidden, "GRADES_NOT_PUBLISHED")
	ErrStarBalanceNegative   = NewError(http.StatusConflict, "STAR_BALANCE_NEGATIVE")
	ErrNoActiveTerm          = NewError(http.StatusConflict, "NO_ACTIVE_TERM")
	ErrScoreOutOfRange       = NewError(http.StatusBadRequest, "SCORE_OUT_OF_RANGE")
	ErrNoGradableSubjects    = NewError(http.StatusBadRequest, "NO_GRADABLE_SUBJECTS")
	ErrStudentNotInClass     = NewError(http.StatusBadRequest, "STUDENT_NOT_IN_CLASS")
	ErrGradeRangeOverlap     = NewError(http.StatusBadRequest, "GRADE_RANGE_OVERLAP")
	ErrTPExportCodeExists    = NewError(http.StatusConflict, "TP_EXPORT_CODE_EXISTS")
	ErrTPKindNotEligible     = NewError(http.StatusBadRequest, "TP_KIND_NOT_ELIGIBLE")
	ErrTPMappingNotFound     = NewError(http.StatusNotFound, "TP_MAPPING_NOT_FOUND")
	ErrGradingModuleDisabled = NewError(http.StatusNotFound, "GRADING_MODULE_DISABLED")
)
