package http

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
)

// Each rule a schedule or substitution request can break reaches the client
// as its own code (with a field detail), never as a bare VALIDATION_FAILED
// the form can only show as "the data sent is invalid", and every code has
// a catalog message so the API's own message is not the generic 500 text.
func TestSchedulingErrorsKeepTheirOwnCode(t *testing.T) {
	cases := []struct {
		name  string
		got   error
		code  string
		field string
	}{
		{"teacher not assigned", mapScheduleError(domain.ErrTeacherNotAssigned), "ACADEMIC_TEACHER_NOT_ASSIGNED", "teacher_user_id"},
		{"journal teacher not assigned", mapJournalError(domain.ErrTeacherNotAssigned), "ACADEMIC_TEACHER_NOT_ASSIGNED", "teacher_user_id"},
		{"period range", mapScheduleError(domain.ErrInvalidPeriodRange), "PERIOD_RANGE_INVALID", "end_period_id"},
		{"day not school day", mapScheduleError(domain.ErrDayNotSchoolDay), "SCHEDULE_DAY_NOT_SCHOOL_DAY", "day_of_week"},
		{"break period", mapScheduleError(domain.ErrPeriodIsBreak), "SCHEDULE_PERIOD_INVALID", "start_period_id"},
		{"weekday mismatch", mapSubstitutionError(domain.ErrSubstitutionWeekdayMismatch), "SUBSTITUTION_WEEKDAY_MISMATCH", "date"},
		{"date in past", mapSubstitutionError(domain.ErrSubstitutionDateInPast), "SUBSTITUTION_DATE_IN_PAST", "date"},
		{"holiday", mapSubstitutionError(domain.ErrSubstitutionNotSchoolDay), "SUBSTITUTION_NOT_SCHOOL_DAY", "date"},
		{"substitute is requester", mapSubstitutionError(domain.ErrSubstituteIsRequester), "SUBSTITUTE_IS_REQUESTER", "substitute_user_id"},
		{"substitute not teacher", mapSubstitutionError(domain.ErrSubstituteNotTeacher), "SUBSTITUTE_NOT_TEACHER", "substitute_user_id"},
		{"lesson not on date", mapSubstitutionError(domain.ErrSubstitutionNotScheduled), "SUBSTITUTION_LESSON_NOT_ON_DATE", "date"},
		{"effective date outside the year", mapScheduleError(domain.ErrEffectiveFromOutOfYear), "SCHEDULE_EFFECTIVE_FROM_INVALID", "effective_from"},
	}
	unknown := i18n.Message("INTERNAL_ERROR", "id")
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var appErr *httpx.Error
			require.True(t, errors.As(tc.got, &appErr))
			require.Equal(t, 400, appErr.Status)
			require.Equal(t, tc.code, appErr.Code)
			require.Len(t, appErr.Details, 1)
			require.Equal(t, tc.field, appErr.Details[0].Field)
			require.NotEqual(t, unknown, i18n.Message(tc.code, "id"))
		})
	}

	// A schedule manager releasing a request already past is a conflict
	// with its own code, not the date-picker's SUBSTITUTION_DATE_IN_PAST.
	var cancelPast *httpx.Error
	require.ErrorAs(t, mapSubstitutionError(domain.ErrSubstitutionCancelPast), &cancelPast)
	require.Equal(t, 409, cancelPast.Status)
	require.Equal(t, "SUBSTITUTION_CANCEL_PAST", cancelPast.Code)

	for _, code := range []string{
		"SCHEDULE_HAS_HISTORY", "SCHEDULE_YEAR_ARCHIVED", "SCHEDULE_CHANGE_BEFORE_HISTORY", "SCHEDULE_ENDED",
		"SCHEDULE_CONFLICT_CLASS", "SCHEDULE_CONFLICT_TEACHER", "SUBSTITUTION_CANCEL_PAST",
	} {
		require.NotEqual(t, unknown, i18n.Message(code, "id"), code)
		require.NotEqual(t, i18n.Message("INTERNAL_ERROR", "en"), i18n.Message(code, "en"), code)
	}
}

// A change refused for its date names the earliest date the server would
// accept, so the editor can offer it; one made by someone who may not date
// a change is forbidden.
func TestEffectiveDateErrorsCarryTheEarliestDate(t *testing.T) {
	earliest := time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		err        error
		status     int
		code       string
		detailCode string
	}{
		{&domain.HistoryRequiresDateError{Min: earliest}, 409, "SCHEDULE_HAS_HISTORY", "REQUIRED"},
		{&domain.ChangeTooEarlyError{Min: earliest}, 409, "SCHEDULE_CHANGE_BEFORE_HISTORY", "BEFORE_MIN"},
	}
	for _, tc := range cases {
		var appErr *httpx.Error
		require.ErrorAs(t, mapScheduleError(tc.err), &appErr)
		require.Equal(t, tc.status, appErr.Status)
		require.Equal(t, tc.code, appErr.Code)
		require.Equal(t, []httpx.ErrorDetail{{Field: "effective_from", Code: tc.detailCode, Message: "2026-11-27"}}, appErr.Details)
	}

	// The record holding the date there comes along, so the editor can say
	// what to release instead of only that something is in the way.
	requestID := uuid.MustParse("01a1fb5e-1b7d-7341-b558-c0210a9cc03c")
	hold := &domain.Hold{
		Kind: domain.HoldSubstitution, ID: requestID, Date: time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC),
		Status: domain.SubstitutionPending,
	}
	var appErr *httpx.Error
	require.ErrorAs(t, mapScheduleError(&domain.ChangeTooEarlyError{Min: earliest, HeldBy: hold}), &appErr)
	require.Equal(t, []httpx.ErrorDetail{
		{Field: "effective_from", Code: "BEFORE_MIN", Message: "2026-11-27"},
		{Field: "held_by.kind", Code: "substitution", Message: "2026-11-26"},
		{Field: "held_by.id", Code: requestID.String()},
		{Field: "held_by.status", Code: "pending"},
	}, appErr.Details)
	session := &domain.Hold{Kind: domain.HoldAttendance, ID: requestID, Date: hold.Date}
	require.ErrorAs(t, mapScheduleError(&domain.HistoryRequiresDateError{Min: earliest, HeldBy: session}), &appErr)
	require.Len(t, appErr.Details, 3, "a session has no status")

	policy := toAPIMutationPolicy(service.MutationPolicy{CanEdit: true, CanDelete: true, HasHistory: true, RequiresEffectiveFrom: true, MinEffectiveFrom: &earliest, HeldBy: hold})
	require.NotNil(t, policy.HeldBy)
	require.Equal(t, "substitution", string(policy.HeldBy.Kind))
	require.Equal(t, requestID, policy.HeldBy.Id)
	require.Equal(t, "2026-11-26", policy.HeldBy.Date.Format(time.DateOnly))
	require.Equal(t, "pending", string(*policy.HeldBy.Status))
	require.Nil(t, toAPIMutationPolicy(service.MutationPolicy{CanEdit: true, CanDelete: true}).HeldBy)

	require.ErrorAs(t, mapScheduleError(domain.ErrScheduleHasHistory), &appErr)
	require.Equal(t, "SCHEDULE_HAS_HISTORY", appErr.Code)
	require.Empty(t, appErr.Details, "a bare history refusal (a teacher's own lesson) names no date")
	require.ErrorAs(t, mapScheduleError(domain.ErrScheduleEnded), &appErr)
	require.Equal(t, 409, appErr.Status)
	require.Equal(t, "SCHEDULE_ENDED", appErr.Code)
	require.ErrorIs(t, mapScheduleError(domain.ErrEffectiveDateAdminOnly), httpx.ErrForbidden)

	// A clash names the dates of the version in the way.
	until := time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC)
	conflict := &domain.ConflictError{Kind: domain.ErrConflictClass, With: domain.Schedule{
		StartSeq: 1, EndSeq: 1, EffectiveFrom: time.Date(2026, 7, 16, 0, 0, 0, 0, time.UTC), EffectiveUntil: &until,
	}}
	require.ErrorAs(t, mapScheduleError(conflict), &appErr)
	require.Equal(t, "SCHEDULE_CONFLICT_CLASS", appErr.Code)
	require.Contains(t, appErr.Details, httpx.ErrorDetail{Field: "effective_from", Code: "2026-07-16"})
	require.Contains(t, appErr.Details, httpx.ErrorDetail{Field: "effective_until", Code: "2026-11-26"})
}
