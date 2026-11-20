package http

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
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

	for _, code := range []string{"SCHEDULE_HAS_HISTORY", "SCHEDULE_YEAR_ARCHIVED"} {
		require.NotEqual(t, unknown, i18n.Message(code, "id"), code)
	}
}
