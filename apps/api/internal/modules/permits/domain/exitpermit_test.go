package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestExitPermitReturn(t *testing.T) {
	exited := time.Date(2027, time.February, 16, 2, 15, 0, 0, time.UTC)
	due := time.Date(2027, time.February, 16, 4, 0, 0, 0, time.UTC)
	at := func(minutesAfterDue int) *time.Time {
		v := due.Add(time.Duration(minutesAfterDue) * time.Minute)
		return &v
	}

	t.Run("a student still out before the due time is not overdue", func(t *testing.T) {
		p := ExitPermit{ExitedAt: &exited, ReturnRequired: true, ExpectedReturnAt: &due}
		require.True(t, p.AwaitingReturn())
		require.False(t, p.IsOverdue(due))
		require.True(t, p.IsOverdue(*at(1)))
	})

	t.Run("a return after the due time is late, one right at it is not", func(t *testing.T) {
		require.False(t, ExitPermit{ExitedAt: &exited, ReturnRequired: true, ExpectedReturnAt: &due, ReturnedAt: at(0)}.ReturnedLate())
		late := ExitPermit{ExitedAt: &exited, ReturnRequired: true, ExpectedReturnAt: &due, ReturnedAt: at(20)}
		require.True(t, late.ReturnedLate())
		require.False(t, late.AwaitingReturn())
		require.False(t, late.IsOverdue(*at(60)))
	})

	t.Run("a student who goes home is never awaited", func(t *testing.T) {
		p := ExitPermit{ExitedAt: &exited, ReturnRequired: false}
		require.False(t, p.AwaitingReturn())
		require.False(t, p.IsOverdue(*at(600)))
	})

	t.Run("a permit that exited before returns were tracked is never awaited", func(t *testing.T) {
		p := ExitPermit{ExitedAt: &exited, ReturnRequired: true}
		require.False(t, p.AwaitingReturn())
		require.False(t, p.IsOverdue(*at(600)))
		require.False(t, p.ReturnedLate())
	})

	t.Run("nothing is awaited before the gate", func(t *testing.T) {
		require.False(t, ExitPermit{ReturnRequired: true, ExpectedReturnAt: &due}.AwaitingReturn())
	})
}

func TestExitPermitReadStatus(t *testing.T) {
	jakarta, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	// LocalDate is a calendar day stored as midnight UTC; today is the
	// tenant-local business instant.
	opened := time.Date(2027, time.April, 21, 0, 0, 0, 0, time.UTC)
	lateSameDay := time.Date(2027, time.April, 21, 23, 30, 0, 0, jakarta)
	nextDay := time.Date(2027, time.April, 22, 0, 1, 0, 0, jakarta)

	for _, status := range []Status{StatusInProgress, StatusApproved} {
		// 23:30 in Jakarta is 16:30 UTC: the school's calendar day decides.
		require.Equal(t, status, ExitPermitReadStatus(status, opened, lateSameDay), "still its own day")
		require.Equal(t, StatusExpired, ExitPermitReadStatus(status, opened, nextDay), "left open on an earlier day")
	}
	for _, status := range []Status{StatusCompleted, StatusCancelled, StatusRejected, StatusExpired} {
		require.Equal(t, status, ExitPermitReadStatus(status, opened, nextDay), "a closed permit keeps its own end")
	}
}
