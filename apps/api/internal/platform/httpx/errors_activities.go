package httpx

import "net/http"

var (
	ErrClubNotFound        = NewError(http.StatusNotFound, "EXTRACURRICULAR_NOT_FOUND")
	ErrClubNameExists      = NewError(http.StatusConflict, "EXTRACURRICULAR_NAME_EXISTS")
	ErrClubInactive        = NewError(http.StatusConflict, "EXTRACURRICULAR_INACTIVE")
	ErrClubFull            = NewError(http.StatusConflict, "EXTRACURRICULAR_FULL")
	ErrClubLimitReached    = NewError(http.StatusConflict, "CLUB_LIMIT_REACHED")
	ErrMembershipNotFound  = NewError(http.StatusNotFound, "MEMBERSHIP_NOT_FOUND")
	ErrMembershipInactive  = NewError(http.StatusConflict, "MEMBERSHIP_NOT_ACTIVE")
	ErrAlreadyMember       = NewError(http.StatusConflict, "ALREADY_MEMBER")
	ErrMeetingNotFound     = NewError(http.StatusNotFound, "MEETING_NOT_FOUND")
	ErrMeetingExists       = NewError(http.StatusConflict, "MEETING_ALREADY_EXISTS")
	ErrNotAMember          = NewError(http.StatusConflict, "NOT_A_MEMBER")
	ErrActivityNotFound    = NewError(http.StatusNotFound, "ACTIVITY_NOT_FOUND")
	ErrAchievementNotFound = NewError(http.StatusNotFound, "ACHIEVEMENT_NOT_FOUND")
	ErrInvalidParticipant  = NewError(http.StatusBadRequest, "INVALID_PARTICIPANT")
)
