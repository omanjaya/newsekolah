package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func TestResolveEffectiveLimitsFallsBackToMemberTypeThenPolicy(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.MaxActiveLoans, policy.LoanDays = 3, 7
	memberType := domain.MemberType{ID: uuid.New(), MaxLoanItems: 5, MaxLoanDays: 10}

	limits := domain.ResolveEffectiveLimits(nil, memberType, policy, day("2026-09-10"))

	require.True(t, limits.AllowLoans)
	require.Equal(t, 5, limits.MaxLoanItems, "member type overrides the tenant policy")
	require.Equal(t, 10, limits.MaxLoanDays)
}

func TestResolveEffectiveLimitsZeroMemberTypeFallsBackToPolicy(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.MaxActiveLoans, policy.LoanDays = 3, 7
	memberType := domain.MemberType{ID: uuid.New()}

	limits := domain.ResolveEffectiveLimits(nil, memberType, policy, day("2026-09-10"))

	require.Equal(t, 3, limits.MaxLoanItems)
	require.Equal(t, 7, limits.MaxLoanDays)
}

func TestResolveEffectiveLimitsAppliesGeneralRuleThenSpecificOverridesIt(t *testing.T) {
	policy := domain.DefaultPolicy()
	memberType := domain.MemberType{ID: uuid.New(), MaxLoanItems: 3, MaxLoanDays: 7}
	general := domain.LoanRule{StartsOn: day("2026-09-01"), EndsOn: day("2026-09-30"), AllowLoans: false}
	items := 1
	specific := domain.LoanRule{
		MemberTypeID: uuid.NullUUID{UUID: memberType.ID, Valid: true},
		StartsOn:     day("2026-09-01"), EndsOn: day("2026-09-30"), AllowLoans: true, MaxLoanItems: &items,
	}

	onlyGeneral := domain.ResolveEffectiveLimits([]domain.LoanRule{general}, memberType, policy, day("2026-09-10"))
	require.False(t, onlyGeneral.AllowLoans, "a tenant-wide closure applies to every member type")

	both := domain.ResolveEffectiveLimits([]domain.LoanRule{general, specific}, memberType, policy, day("2026-09-10"))
	require.True(t, both.AllowLoans, "a rule specific to the member's type overrides the general one")
	require.Equal(t, 1, both.MaxLoanItems)
}

func TestResolveEffectiveLimitsIgnoresRuleOutsideItsDateRange(t *testing.T) {
	policy := domain.DefaultPolicy()
	memberType := domain.MemberType{ID: uuid.New(), MaxLoanItems: 3, MaxLoanDays: 7}
	rule := domain.LoanRule{StartsOn: day("2026-01-01"), EndsOn: day("2026-01-31"), AllowLoans: false}

	limits := domain.ResolveEffectiveLimits([]domain.LoanRule{rule}, memberType, policy, day("2026-09-10"))

	require.True(t, limits.AllowLoans)
}

func TestWorkingDayRuleIsWorkingDay(t *testing.T) {
	w := domain.WorkingDayRule{SaturdayClosed: true, SundayClosed: true, Holidays: map[string]bool{"2026-09-17": true}}

	require.True(t, w.IsWorkingDay(day("2026-09-14")), "Monday")
	require.False(t, w.IsWorkingDay(day("2026-09-12")), "Saturday, closed")
	require.False(t, w.IsWorkingDay(day("2026-09-13")), "Sunday, closed")
	require.False(t, w.IsWorkingDay(day("2026-09-17")), "a holiday on a weekday")
}

func TestWorkingDayRuleAddWorkingDaysSkipsWeekendsAndHolidays(t *testing.T) {
	w := domain.WorkingDayRule{SaturdayClosed: true, SundayClosed: true, Holidays: map[string]bool{"2026-09-17": true}}

	// Thursday 2026-09-10 + 5 working days: Fri 11, (skip Sat 12, Sun 13),
	// Mon 14, Tue 15, Wed 16, (skip holiday Thu 17), lands on Fri 18.
	got := w.AddWorkingDays(day("2026-09-10"), 5)

	require.Equal(t, day("2026-09-18"), got)
}

func TestWorkingDayRuleAddWorkingDaysNoClosuresMatchesCalendarDays(t *testing.T) {
	w := domain.WorkingDayRule{}

	got := w.AddWorkingDays(day("2026-09-10"), 7)

	require.Equal(t, day("2026-09-17"), got)
}

func TestWorkingDayRuleWorkingDaysLate(t *testing.T) {
	w := domain.WorkingDayRule{SaturdayClosed: true, SundayClosed: true}

	require.Equal(t, 0, w.WorkingDaysLate(day("2026-09-10"), day("2026-09-10")), "returned on the due date")
	require.Equal(t, 0, w.WorkingDaysLate(day("2026-09-10"), day("2026-09-08")), "returned early")
	// Due Thu 10, returned the following Mon 14: Fri 11 counts, the
	// weekend does not, Mon 14 counts -- 2 late working days.
	require.Equal(t, 2, w.WorkingDaysLate(day("2026-09-10"), day("2026-09-14")))
}

func TestComputeLateOutcomeFineConstant(t *testing.T) {
	memberType := domain.MemberType{FineType: domain.FineConstant, FinePerTenor: 1000}

	outcome := domain.ComputeLateOutcome(5, true, memberType)

	require.Equal(t, domain.PenaltyFine, outcome.Penalty)
	require.Equal(t, 1000, outcome.FineAmount, "a constant fine is one flat charge regardless of days late")
}

func TestComputeLateOutcomeFinePerTenor(t *testing.T) {
	memberType := domain.MemberType{FineType: domain.FinePerTenor, FinePerTenor: 1000, TenorDays: 3}

	require.Equal(t, 1000, domain.ComputeLateOutcome(1, true, memberType).FineAmount, "1 late day is 1 partial tenor")
	require.Equal(t, 1000, domain.ComputeLateOutcome(3, true, memberType).FineAmount, "exactly one tenor")
	require.Equal(t, 2000, domain.ComputeLateOutcome(4, true, memberType).FineAmount, "1 tenor plus a partial second tenor")
}

func TestComputeLateOutcomeSuspendWhenFinesDisabled(t *testing.T) {
	memberType := domain.MemberType{SuspendDays: 3}

	outcome := domain.ComputeLateOutcome(5, false, memberType)

	require.Equal(t, domain.PenaltySuspend, outcome.Penalty)
	require.Equal(t, 3, outcome.SuspendDays)
}

func TestComputeLateOutcomeWarningWhenNeitherApplies(t *testing.T) {
	outcome := domain.ComputeLateOutcome(5, false, domain.MemberType{})

	require.Equal(t, domain.PenaltyWarning, outcome.Penalty)
	require.Zero(t, outcome.FineAmount)
	require.Zero(t, outcome.SuspendDays)
}

func TestCopyCanBorrowByAllowsOnlyTheMemberTheHoldIsFor(t *testing.T) {
	reserved := domain.Copy{Status: domain.CopyReserved}

	require.NoError(t, reserved.CanBorrowBy(true), "the member the copy was held for may borrow it")
	require.ErrorIs(t, reserved.CanBorrowBy(false), domain.ErrCopyNotAvailable, "nobody else may")

	available := domain.Copy{Status: domain.CopyAvailable}
	require.NoError(t, available.CanBorrowBy(false))
}
