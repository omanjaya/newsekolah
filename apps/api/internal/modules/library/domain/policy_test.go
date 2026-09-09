package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestCalculateFine(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.FinePerDay = 1000

	tests := []struct {
		name       string
		dueOn      time.Time
		returnedOn time.Time
		want       int
	}{
		{"returned on the due date", day("2026-09-10"), day("2026-09-10"), 0},
		{"returned early", day("2026-09-10"), day("2026-09-08"), 0},
		{"one day late", day("2026-09-10"), day("2026-09-11"), 1000},
		{"five days late", day("2026-09-10"), day("2026-09-15"), 5000},
		{"time of day is ignored, only the calendar day counts", day("2026-09-10").Add(20 * time.Hour), day("2026-09-11").Add(1 * time.Hour), 1000},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, domain.CalculateFine(policy, tt.dueOn, tt.returnedOn))
		})
	}
}

func TestCalculateFineZeroWhenNoRate(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.FinePerDay = 0
	require.Equal(t, 0, domain.CalculateFine(policy, day("2026-09-10"), day("2026-09-20")))
}

func TestCanBorrowRejectsCopyAlreadyOnLoan(t *testing.T) {
	policy := domain.DefaultPolicy()
	copy := domain.Copy{Status: domain.CopyOnLoan}

	err := domain.CanBorrow(copy, 0, policy)

	require.ErrorIs(t, err, domain.ErrCopyOnLoan)
}

func TestCanBorrowRejectsWithdrawnCopy(t *testing.T) {
	policy := domain.DefaultPolicy()
	copy := domain.Copy{Status: domain.CopyWithdrawn}

	err := domain.CanBorrow(copy, 0, policy)

	require.ErrorIs(t, err, domain.ErrCopyNotAvailable)
}

func TestCanBorrowRejectsAtLoanLimit(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.MaxActiveLoans = 2
	copy := domain.Copy{Status: domain.CopyAvailable}

	require.NoError(t, domain.CanBorrow(copy, 1, policy))
	require.ErrorIs(t, domain.CanBorrow(copy, 2, policy), domain.ErrLoanLimitReached)
}

func TestCanRenewRules(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.MaxRenewals = 1
	now := day("2026-09-10")

	t.Run("ok within limits", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 0}
		require.NoError(t, domain.CanRenew(loan, policy, now, false))
	})

	t.Run("rejects at renewal limit", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 1}
		require.ErrorIs(t, domain.CanRenew(loan, policy, now, false), domain.ErrRenewalLimitReached)
	})

	t.Run("rejects an overdue loan", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-05"), RenewalCount: 0}
		require.ErrorIs(t, domain.CanRenew(loan, policy, now, false), domain.ErrRenewalBlockedOverdue)
	})

	t.Run("rejects when a reservation is waiting", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 0}
		require.ErrorIs(t, domain.CanRenew(loan, policy, now, true), domain.ErrRenewalBlockedReserved)
	})

	t.Run("rejects an already returned loan", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanReturned, DueOn: day("2026-09-12")}
		require.ErrorIs(t, domain.CanRenew(loan, policy, now, false), domain.ErrLoanAlreadyReturned)
	})
}

func TestNextWaitingServesEarliestRequestFirst(t *testing.T) {
	first := uuid.New()
	second := uuid.New()
	reservations := []domain.Reservation{
		{ID: second, Status: domain.ReservationWaiting, RequestedAt: day("2026-09-10")},
		{ID: first, Status: domain.ReservationWaiting, RequestedAt: day("2026-09-08")},
		{ID: uuid.New(), Status: domain.ReservationCancelled, RequestedAt: day("2026-09-01")},
	}

	next, ok := domain.NextWaiting(reservations)

	require.True(t, ok)
	require.Equal(t, first, next.ID, "the earliest waiting request is served first, cancelled ones are skipped")
}

func TestNextWaitingEmptyQueue(t *testing.T) {
	_, ok := domain.NextWaiting(nil)
	require.False(t, ok)

	_, ok = domain.NextWaiting([]domain.Reservation{{Status: domain.ReservationFulfilled}})
	require.False(t, ok)
}

func TestQueuePosition(t *testing.T) {
	a, b, c := uuid.New(), uuid.New(), uuid.New()
	reservations := []domain.Reservation{
		{ID: b, Status: domain.ReservationWaiting, RequestedAt: day("2026-09-09")},
		{ID: a, Status: domain.ReservationWaiting, RequestedAt: day("2026-09-08")},
		{ID: c, Status: domain.ReservationFulfilled, RequestedAt: day("2026-09-01")},
	}

	require.Equal(t, 1, domain.QueuePosition(reservations, a))
	require.Equal(t, 2, domain.QueuePosition(reservations, b))
	require.Equal(t, 0, domain.QueuePosition(reservations, c), "a reservation no longer waiting has no queue position")
}

func TestDiffStocktakeFindsMissingAndUnexpected(t *testing.T) {
	present := domain.Copy{ID: uuid.New(), Barcode: "BC-001"}
	missingCopy := domain.Copy{ID: uuid.New(), Barcode: "BC-002"}
	expected := []domain.Copy{present, missingCopy}

	result := domain.DiffStocktake(expected, []string{"BC-001", "BC-999"})

	require.Equal(t, 2, result.ExpectedCount)
	require.Equal(t, 2, result.ScannedCount)
	require.Len(t, result.Missing, 1)
	require.Equal(t, missingCopy.ID, result.Missing[0].ID)
	require.Equal(t, []string{"BC-999"}, result.Unexpected)
}

func TestDiffStocktakeAllAccountedFor(t *testing.T) {
	expected := []domain.Copy{{Barcode: "BC-001"}, {Barcode: "BC-002"}}

	result := domain.DiffStocktake(expected, []string{"BC-001", "BC-002"})

	require.Empty(t, result.Missing)
	require.Empty(t, result.Unexpected)
}
