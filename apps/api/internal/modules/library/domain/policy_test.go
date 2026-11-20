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

func TestSchoolDayReadsTheInstantInTheSchoolZone(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)

	// 07:30 WITA on Monday 14 Dec is still Sunday 13 Dec in UTC.
	require.Equal(t, day("2026-12-14"), domain.SchoolDay(time.Date(2026, 12, 13, 23, 30, 0, 0, time.UTC), wita))
	require.Equal(t, day("2026-12-14"), domain.SchoolDay(time.Date(2026, 12, 14, 1, 0, 0, 0, time.UTC), wita))
	require.Equal(t, day("2026-12-13"), domain.SchoolDay(time.Date(2026, 12, 13, 23, 30, 0, 0, time.UTC), time.UTC))
	require.Equal(t, day("2026-12-13"), domain.SchoolDay(time.Date(2026, 12, 13, 23, 30, 0, 0, time.UTC), nil))
}

func TestRenewalLimitsFollowTheMemberType(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.MaxRenewals = 1
	policy.RenewalDays = 7

	teachers := domain.MemberType{MaxRenewals: 2, RenewalDays: 14}
	maxRenewals, renewalDays := domain.RenewalLimits(teachers, true, policy)
	require.Equal(t, 2, maxRenewals, "the type's own limit wins over the tenant policy")
	require.Equal(t, 14, renewalDays)

	never := domain.MemberType{MaxRenewals: 0, RenewalDays: 7}
	maxRenewals, _ = domain.RenewalLimits(never, true, policy)
	require.Zero(t, maxRenewals, "0 renewals on a type means none, not unset")

	maxRenewals, renewalDays = domain.RenewalLimits(domain.MemberType{}, false, policy)
	require.Equal(t, 1, maxRenewals, "a member with no type falls back to the policy")
	require.Equal(t, 7, renewalDays)
}

func TestPolicyLateRuleChargesThePolicyFinePerDay(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.FinePerDay = 1000

	outcome := domain.ComputeLateOutcome(3, true, domain.PolicyLateRule(policy))

	require.Equal(t, domain.PenaltyFine, outcome.Penalty)
	require.Equal(t, 3000, outcome.FineAmount)
}

func TestCanBorrowRejectsCopyAlreadyOnLoan(t *testing.T) {
	policy := domain.DefaultPolicy()
	copy := domain.Copy{Status: domain.CopyOnLoan}

	err := domain.CanBorrow(copy, 0, policy)

	require.ErrorIs(t, err, domain.ErrCopyOnLoan)
}

func TestCanBorrowRejectsLostCopy(t *testing.T) {
	policy := domain.DefaultPolicy()
	copy := domain.Copy{Status: domain.CopyLost}

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
	maxRenewals := 1
	now := day("2026-09-10")

	t.Run("ok within limits", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 0}
		require.NoError(t, domain.CanRenew(loan, maxRenewals, now, false))
	})

	t.Run("rejects at renewal limit", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 1}
		require.ErrorIs(t, domain.CanRenew(loan, maxRenewals, now, false), domain.ErrRenewalLimitReached)
	})

	t.Run("rejects an overdue loan", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-05"), RenewalCount: 0}
		require.ErrorIs(t, domain.CanRenew(loan, maxRenewals, now, false), domain.ErrRenewalBlockedOverdue)
	})

	t.Run("rejects when a reservation is waiting", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 0}
		require.ErrorIs(t, domain.CanRenew(loan, maxRenewals, now, true), domain.ErrRenewalBlockedReserved)
	})

	t.Run("renews on the due date itself, and refuses the day after", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-12-15"), RenewalCount: 0}
		wita, err := time.LoadLocation("Asia/Makassar")
		require.NoError(t, err)
		// 09:00 WITA on the due date is 01:00Z: an instant past the due
		// date's midnight UTC, but still the due date at school.
		today := domain.SchoolDay(time.Date(2026, 12, 15, 1, 0, 0, 0, time.UTC), wita)
		require.NoError(t, domain.CanRenew(loan, maxRenewals, today, false))
		require.ErrorIs(t, domain.CanRenew(loan, maxRenewals, day("2026-12-16"), false), domain.ErrRenewalBlockedOverdue)
	})

	t.Run("allows a second renewal when the limit is 2", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanActive, DueOn: day("2026-09-12"), RenewalCount: 1}
		require.NoError(t, domain.CanRenew(loan, 2, now, false))
		require.ErrorIs(t, domain.CanRenew(loan, 0, now, false), domain.ErrRenewalLimitReached)
	})

	t.Run("rejects an already returned loan", func(t *testing.T) {
		loan := domain.Loan{Status: domain.LoanReturned, DueOn: day("2026-09-12")}
		require.ErrorIs(t, domain.CanRenew(loan, maxRenewals, now, false), domain.ErrLoanAlreadyReturned)
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
	onLoanButOnShelf := domain.Copy{ID: uuid.New(), Barcode: "BC-999"}
	expected := []domain.Copy{present, missingCopy}
	scans := []domain.ScanRecord{
		{Scan: domain.StocktakeScan{CopyID: uuid.NullUUID{UUID: present.ID, Valid: true}, Outcome: domain.ScanFound}, Copy: present},
		{Scan: domain.StocktakeScan{CopyID: uuid.NullUUID{UUID: onLoanButOnShelf.ID, Valid: true}, Outcome: domain.ScanFound}, Copy: onLoanButOnShelf},
		{Scan: domain.StocktakeScan{RawCode: "no-such-code", Outcome: domain.ScanRejected}},
	}

	result := domain.DiffStocktake(expected, scans)

	require.Equal(t, 2, result.ExpectedCount)
	// Only the expected copy that was found counts as scanned, so scanned
	// plus missing adds up to expected; the copy on loan is unexpected.
	// Rejected scans count nowhere.
	require.Equal(t, 1, result.ScannedCount)
	require.Equal(t, result.ExpectedCount, result.ScannedCount+len(result.Missing))
	require.Len(t, result.Missing, 1)
	require.Equal(t, missingCopy.ID, result.Missing[0].ID)
	require.Len(t, result.Unexpected, 1)
	require.Equal(t, onLoanButOnShelf.ID, result.Unexpected[0].ID)
}

func TestDiffStocktakeAllAccountedFor(t *testing.T) {
	a := domain.Copy{ID: uuid.New(), Barcode: "BC-001"}
	b := domain.Copy{ID: uuid.New(), Barcode: "BC-002"}
	expected := []domain.Copy{a, b}
	scans := []domain.ScanRecord{
		{Scan: domain.StocktakeScan{CopyID: uuid.NullUUID{UUID: a.ID, Valid: true}, Outcome: domain.ScanFound}, Copy: a},
		{Scan: domain.StocktakeScan{CopyID: uuid.NullUUID{UUID: b.ID, Valid: true}, Outcome: domain.ScanFound}, Copy: b},
	}

	result := domain.DiffStocktake(expected, scans)

	require.Empty(t, result.Missing)
	require.Empty(t, result.Unexpected)
}

func TestDiffStocktakeFindsMisplacedCopy(t *testing.T) {
	home := uuid.New()
	shelf := uuid.New()
	copyInWrongPlace := domain.Copy{ID: uuid.New(), Barcode: "BC-003", LocationID: uuid.NullUUID{UUID: home, Valid: true}}
	expected := []domain.Copy{copyInWrongPlace}
	scans := []domain.ScanRecord{
		{
			Scan: domain.StocktakeScan{
				CopyID: uuid.NullUUID{UUID: copyInWrongPlace.ID, Valid: true}, Outcome: domain.ScanFound,
				LocationID: uuid.NullUUID{UUID: shelf, Valid: true},
			},
			Copy: copyInWrongPlace,
		},
	}

	result := domain.DiffStocktake(expected, scans)

	require.Empty(t, result.Missing)
	require.Len(t, result.Misplaced, 1)
	require.Equal(t, copyInWrongPlace.ID, result.Misplaced[0].Copy.ID)
	require.Equal(t, shelf, result.Misplaced[0].FoundLocationID)
}

func TestNormalizeISBN(t *testing.T) {
	require.Equal(t, "9786021234X", domain.NormalizeISBN("978-602-1234-x"))
	require.Equal(t, "9786021234X", domain.NormalizeISBN(" 978 602 1234 X "))
}

func TestGenerateCallNumber(t *testing.T) {
	require.Equal(t, "813 KUR n", domain.GenerateCallNumber("813", "Kurniawan", "negeri"))
	require.Equal(t, "", domain.GenerateCallNumber("", "", ""))
	require.Equal(t, "813", domain.GenerateCallNumber("813", "", ""))
}

func TestLooksLikeDDC(t *testing.T) {
	for _, s := range []string{"899", "899.221", " 813.5 ", "000"} {
		require.True(t, domain.LooksLikeDDC(s), s)
	}
	for _, s := range []string{"", "89", "899.", "899,221", "Fiksi - Novel Indonesia", "8a9", "899.2a"} {
		require.False(t, domain.LooksLikeDDC(s), s)
	}
}
