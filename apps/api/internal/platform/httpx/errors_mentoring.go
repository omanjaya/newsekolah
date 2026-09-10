package httpx

import "net/http"

var (
	ErrMentorGroupNotFound        = NewError(http.StatusNotFound, "MENTOR_GROUP_NOT_FOUND")
	ErrMentorGroupFull            = NewError(http.StatusConflict, "MENTOR_GROUP_FULL")
	ErrMentorMemberAlreadyInGroup = NewError(http.StatusConflict, "MENTOR_MEMBER_ALREADY_IN_GROUP")
	ErrMentorNoteNotFound         = NewError(http.StatusNotFound, "MENTOR_NOTE_NOT_FOUND")
	ErrMentorNoteForbidden        = NewError(http.StatusForbidden, "MENTOR_NOTE_FORBIDDEN")
	ErrMentorSummaryNotFound      = NewError(http.StatusNotFound, "MENTOR_SUMMARY_NOT_FOUND")
	ErrMentoringModuleDisabled    = NewError(http.StatusForbidden, "MENTORING_MODULE_DISABLED")
)
