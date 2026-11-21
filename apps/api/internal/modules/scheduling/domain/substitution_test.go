package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

func TestValidateNewSubstitution(t *testing.T) {
	requester := uuid.New()
	substitute := uuid.New()
	// 2026-03-02 is a Monday (day_of_week = 1).
	monday := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	tuesday := monday.AddDate(0, 0, 1)

	// "today" is the tenant's wall clock; a late-evening instant in a zone
	// ahead of UTC must still count as that zone's calendar date.
	today := time.Date(2026, 3, 2, 21, 0, 0, 0, time.FixedZone("WITA", 8*3600))

	require.NoError(t, domain.ValidateNewSubstitution(requester, substitute, 1, monday, today))
	require.ErrorIs(t, domain.ValidateNewSubstitution(requester, requester, 1, monday, today), domain.ErrSubstituteIsRequester)
	require.ErrorIs(t, domain.ValidateNewSubstitution(requester, substitute, 1, tuesday, today), domain.ErrSubstitutionWeekdayMismatch)
	require.ErrorIs(t, domain.ValidateNewSubstitution(requester, substitute, 1, monday, today.AddDate(0, 0, 1)), domain.ErrSubstitutionDateInPast)
	require.NoError(t, domain.ValidateNewSubstitution(requester, substitute, 1, monday.AddDate(0, 0, 7), today))
}

func TestSubstitutionCanRespond(t *testing.T) {
	substitute := uuid.New()
	other := uuid.New()
	s := domain.Substitution{Status: domain.SubstitutionPending, SubstituteUserID: substitute}

	require.NoError(t, s.CanRespond(substitute))
	require.ErrorIs(t, s.CanRespond(other), domain.ErrSubstitutionNotSubstitute)

	accepted := s
	accepted.Status = domain.SubstitutionAccepted
	require.ErrorIs(t, accepted.CanRespond(substitute), domain.ErrSubstitutionNotPending)
}

func TestSubstitutionCanCancel(t *testing.T) {
	requester := uuid.New()
	date := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	// Late evening in a zone ahead of UTC: still 2 March there.
	today := time.Date(2026, 3, 2, 21, 0, 0, 0, time.FixedZone("WITA", 8*3600))
	s := domain.Substitution{Status: domain.SubstitutionPending, RequesterUserID: requester, Date: date}

	require.NoError(t, s.CanCancel(requester, false, today))
	require.ErrorIs(t, s.CanCancel(uuid.New(), false, today), domain.ErrSubstitutionNotRequester)
	require.NoError(t, s.CanCancel(uuid.New(), true, today), "a schedule manager releases another teacher's request")

	accepted := s
	accepted.Status = domain.SubstitutionAccepted
	require.NoError(t, accepted.CanCancel(uuid.New(), true, today))

	rejected := s
	rejected.Status = domain.SubstitutionRejected
	require.ErrorIs(t, rejected.CanCancel(requester, false, today), domain.ErrSubstitutionAlreadyResponded)
	require.ErrorIs(t, rejected.CanCancel(uuid.New(), true, today), domain.ErrSubstitutionAlreadyResponded)
}

// A schedule manager releases only a request still to come (today or
// later): one already past holds no change back, and cancelling it would
// rewrite who taught a lesson that is over.
func TestSubstitutionCanCancelPastOnlyByRequester(t *testing.T) {
	requester := uuid.New()
	manager := uuid.New()
	date := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	nextDay := time.Date(2026, 3, 3, 7, 0, 0, 0, time.FixedZone("WITA", 8*3600))

	for _, status := range []domain.SubstitutionStatus{domain.SubstitutionPending, domain.SubstitutionAccepted} {
		s := domain.Substitution{Status: status, RequesterUserID: requester, Date: date}
		require.ErrorIs(t, s.CanCancel(manager, true, nextDay), domain.ErrSubstitutionCancelPast, status)
		require.NoError(t, s.CanCancel(manager, true, date), "on the day itself, %s", status)
		require.NoError(t, s.CanCancel(manager, true, date.AddDate(0, 0, -7)), "a week ahead, %s", status)
	}

	// The requester's own withdrawal keeps its rule; a manager who made
	// the request is its requester too.
	own := domain.Substitution{Status: domain.SubstitutionPending, RequesterUserID: requester, Date: date}
	require.NoError(t, own.CanCancel(requester, false, nextDay))
	require.NoError(t, own.CanCancel(requester, true, nextDay))
	// A refusal on rights or state comes before the date.
	require.ErrorIs(t, own.CanCancel(manager, false, nextDay), domain.ErrSubstitutionNotRequester)
	cancelled := own
	cancelled.Status = domain.SubstitutionCancelled
	require.ErrorIs(t, cancelled.CanCancel(manager, true, nextDay), domain.ErrSubstitutionAlreadyResponded)
}

func TestSubstitutionGrantsAccess(t *testing.T) {
	scheduleID := uuid.New()
	date := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	s := domain.Substitution{Status: domain.SubstitutionAccepted, ScheduleID: scheduleID, Date: date}

	require.True(t, s.GrantsAccess(scheduleID, date))
	require.False(t, s.GrantsAccess(scheduleID, date.AddDate(0, 0, 1)))
	require.False(t, s.GrantsAccess(uuid.New(), date))

	pending := s
	pending.Status = domain.SubstitutionPending
	require.False(t, pending.GrantsAccess(scheduleID, date))
}
