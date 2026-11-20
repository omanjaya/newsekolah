package http

import (
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// TestMapAttendanceErrorNamesTheProblem: a half-filled journal and a
// lesson that has not started get codes of their own, so a client can say
// what to fix instead of a generic "invalid data".
func TestMapAttendanceErrorNamesTheProblem(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{domain.ErrJournalRequired, http.StatusBadRequest, "ATTENDANCE_JOURNAL_INCOMPLETE"},
		{domain.ErrSessionNotStarted, http.StatusConflict, "ATTENDANCE_SESSION_NOT_STARTED"},
	} {
		var appErr *httpx.Error
		require.True(t, errors.As(mapAttendanceError(tc.err), &appErr))
		require.Equal(t, tc.status, appErr.Status)
		require.Equal(t, tc.code, appErr.Code)
	}
}
