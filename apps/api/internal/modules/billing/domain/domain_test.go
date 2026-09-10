package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
)

func mustV7(t *testing.T) uuid.UUID {
	t.Helper()
	id, err := uuid.NewV7()
	require.NoError(t, err)
	return id
}

// TestPlanGeneration_Idempotent is the single most important property in
// this module: generating bills twice for the same fee types, students
// and period must never produce a second charge.
func TestPlanGeneration_Idempotent(t *testing.T) {
	feeType := domain.FeeType{ID: mustV7(t), Name: "SPP Juli", AmountMinor: 250_000, Currency: "IDR", Recurrence: domain.RecurrenceMonthly, IsActive: true}
	students := []domain.StudentEnrollment{
		{StudentUserID: mustV7(t)},
		{StudentUserID: mustV7(t)},
		{StudentUserID: mustV7(t)},
	}

	firstRun := domain.PlanGeneration([]domain.FeeType{feeType}, students, "2026-07", nil, nil)
	require.Len(t, firstRun, 3, "one bill per student on the first run")

	existing := make(map[domain.BillKey]bool, len(firstRun))
	for _, c := range firstRun {
		existing[c.Key] = true
	}

	secondRun := domain.PlanGeneration([]domain.FeeType{feeType}, students, "2026-07", nil, existing)
	require.Empty(t, secondRun, "re-running generation for the same period must not double-charge")

	// A new period is a different key and must still be charged.
	nextMonth := domain.PlanGeneration([]domain.FeeType{feeType}, students, "2026-08", nil, existing)
	require.Len(t, nextMonth, 3)
}

func TestPlanGeneration_SkipsInactiveFeeType(t *testing.T) {
	feeType := domain.FeeType{ID: mustV7(t), Name: "Retired fee", AmountMinor: 100_000, Currency: "IDR", Recurrence: domain.RecurrenceMonthly, IsActive: false}
	students := []domain.StudentEnrollment{{StudentUserID: mustV7(t)}}

	plan := domain.PlanGeneration([]domain.FeeType{feeType}, students, "2026-07", nil, nil)
	require.Empty(t, plan)
}

func TestPlanGeneration_OneOffUsesFeeTypePeriod(t *testing.T) {
	feeType := domain.FeeType{
		ID: mustV7(t), Name: "Uang pangkal", AmountMinor: 5_000_000, Currency: "IDR",
		Recurrence: domain.RecurrenceOneOff, Period: "2026-uang-pangkal", IsActive: true,
	}
	student := domain.StudentEnrollment{StudentUserID: mustV7(t)}

	plan := domain.PlanGeneration([]domain.FeeType{feeType}, []domain.StudentEnrollment{student}, "2026-07", nil, nil)
	require.Len(t, plan, 1)
	require.Equal(t, "2026-uang-pangkal", plan[0].Key.Period, "a one-off fee type ignores the requested period")
}

func TestPlanGeneration_AppliesDiscount(t *testing.T) {
	feeType := domain.FeeType{ID: mustV7(t), Name: "SPP", AmountMinor: 200_000, Currency: "IDR", Recurrence: domain.RecurrenceMonthly, IsActive: true}
	student := domain.StudentEnrollment{StudentUserID: mustV7(t)}
	discount := domain.Discount{Kind: domain.DiscountPercentage, PercentageBp: 5000, IsActive: true, Reason: "sibling discount"}

	discounts := map[domain.FeeStudentKey]domain.Discount{
		{FeeTypeID: feeType.ID, StudentUserID: student.StudentUserID}: discount,
	}
	plan := domain.PlanGeneration([]domain.FeeType{feeType}, []domain.StudentEnrollment{student}, "2026-07", discounts, nil)
	require.Len(t, plan, 1)
	require.Equal(t, int64(100_000), plan[0].DiscountAmountMinor)
	require.Equal(t, int64(100_000), plan[0].AmountMinor)
}

func TestDiscountApply(t *testing.T) {
	cases := []struct {
		name     string
		discount domain.Discount
		original int64
		want     int64
	}{
		{"waiver clears the full amount", domain.Discount{Kind: domain.DiscountWaiver, IsActive: true}, 300_000, 300_000},
		{"fixed reduces by the configured amount", domain.Discount{Kind: domain.DiscountFixed, AmountMinor: 50_000, IsActive: true}, 300_000, 50_000},
		{"fixed never exceeds the charge", domain.Discount{Kind: domain.DiscountFixed, AmountMinor: 999_000, IsActive: true}, 300_000, 300_000},
		{"percentage floors to the nearest minor unit", domain.Discount{Kind: domain.DiscountPercentage, PercentageBp: 3333, IsActive: true}, 100_000, 33_330},
		{"inactive discount applies nothing", domain.Discount{Kind: domain.DiscountWaiver, IsActive: false}, 300_000, 0},
		{"zero charge has nothing to discount", domain.Discount{Kind: domain.DiscountWaiver, IsActive: true}, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, tc.discount.Apply(tc.original))
		})
	}
}

func TestValidatePayment(t *testing.T) {
	bill := domain.Bill{AmountMinor: 200_000, PaidAmountMinor: 50_000}

	require.NoError(t, domain.ValidatePayment(bill, 150_000), "paying exactly the outstanding balance is allowed")
	require.NoError(t, domain.ValidatePayment(bill, 20_000), "a partial payment is allowed")
	require.ErrorIs(t, domain.ValidatePayment(bill, 0), domain.ErrInvalidInput)
	require.ErrorIs(t, domain.ValidatePayment(bill, -10), domain.ErrInvalidInput)
	require.ErrorIs(t, domain.ValidatePayment(bill, 150_001), domain.ErrPaymentExceedsOutstanding)

	paidBill := domain.Bill{AmountMinor: 200_000, PaidAmountMinor: 200_000}
	require.ErrorIs(t, domain.ValidatePayment(paidBill, 1), domain.ErrBillAlreadyPaid)
}

// TestRecomputeBillPayments_PartialThenFull exercises the arithmetic a
// front-desk clerk relies on most: two partial payments summing to the
// full amount must flip the bill to paid, and voiding one of them must
// drop it back to partial without touching the other payment.
func TestRecomputeBillPayments_PartialThenFull(t *testing.T) {
	bill := domain.Bill{AmountMinor: 300_000}
	first := domain.Payment{AmountMinor: 100_000}
	second := domain.Payment{AmountMinor: 200_000}

	afterFirst := domain.RecomputeBillPayments(bill, []domain.Payment{first})
	require.Equal(t, int64(100_000), afterFirst.PaidAmountMinor)
	require.Equal(t, domain.BillPartial, afterFirst.Status)

	afterSecond := domain.RecomputeBillPayments(bill, []domain.Payment{first, second})
	require.Equal(t, int64(300_000), afterSecond.PaidAmountMinor)
	require.Equal(t, domain.BillPaid, afterSecond.Status)
	require.Equal(t, int64(0), afterSecond.Outstanding())
}

func TestRecomputeBillPayments_VoidRestoresOutstanding(t *testing.T) {
	bill := domain.Bill{AmountMinor: 300_000}
	voidedAt := time.Now()
	first := domain.Payment{AmountMinor: 100_000}
	second := domain.Payment{AmountMinor: 200_000, VoidedAt: &voidedAt, VoidReason: "wrong bill selected"}

	after := domain.RecomputeBillPayments(bill, []domain.Payment{first, second})
	require.Equal(t, int64(100_000), after.PaidAmountMinor, "a voided payment must not count toward paid")
	require.Equal(t, domain.BillPartial, after.Status)
	require.Equal(t, int64(200_000), after.Outstanding())
}

func TestArrearsByStudentAndClass(t *testing.T) {
	studentA := mustV7(t)
	studentB := mustV7(t)
	classX := mustV7(t)
	classY := mustV7(t)

	bills := []domain.Bill{
		{StudentUserID: studentA, AmountMinor: 200_000, PaidAmountMinor: 0},
		{StudentUserID: studentA, AmountMinor: 100_000, PaidAmountMinor: 100_000}, // fully paid, excluded
		{StudentUserID: studentB, AmountMinor: 150_000, PaidAmountMinor: 50_000},
	}
	classOf := map[uuid.UUID]uuid.NullUUID{
		studentA: {UUID: classX, Valid: true},
		studentB: {UUID: classY, Valid: true},
	}

	byStudent := domain.ArrearsByStudent(bills, classOf)
	require.Len(t, byStudent, 2)
	require.Equal(t, studentA, byStudent[0].StudentUserID)
	require.Equal(t, int64(200_000), byStudent[0].OutstandingMinor)
	require.Equal(t, 1, byStudent[0].BillCount)
	require.Equal(t, int64(100_000), byStudent[1].OutstandingMinor)

	byClass := domain.ArrearsByClass(byStudent)
	require.Len(t, byClass, 2)
	total := int64(0)
	for _, c := range byClass {
		total += c.OutstandingMinor
		require.Equal(t, 1, c.StudentCount)
	}
	require.Equal(t, int64(300_000), total)
}

func TestFeeTypeValidate(t *testing.T) {
	valid := domain.FeeType{Name: "SPP", AmountMinor: 100_000, Currency: "IDR", Recurrence: domain.RecurrenceMonthly}
	require.NoError(t, valid.Validate())

	missingPeriod := valid
	missingPeriod.Recurrence = domain.RecurrenceOneOff
	require.ErrorIs(t, missingPeriod.Validate(), domain.ErrInvalidInput)

	negativeAmount := valid
	negativeAmount.AmountMinor = -1
	require.ErrorIs(t, negativeAmount.Validate(), domain.ErrInvalidInput)

	noName := valid
	noName.Name = ""
	require.ErrorIs(t, noName.Validate(), domain.ErrInvalidInput)
}
