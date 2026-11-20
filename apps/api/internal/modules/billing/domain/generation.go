package domain

import "github.com/google/uuid"

// StudentEnrollment is the minimal shape generation needs about a
// student: who they are and, when known, which class they are in (for
// the arrears-by-class report).
type StudentEnrollment struct {
	StudentUserID uuid.UUID
	ClassID       uuid.NullUUID
}

// BillKey identifies one idempotent charge: the same fee type, student
// and period must never produce two bills. The bills table's unique
// index enforces this at the database level too; PlanGeneration is what
// keeps a second run from even attempting the insert.
type BillKey struct {
	FeeTypeID     uuid.UUID
	StudentUserID uuid.UUID
	Period        string
}

// FeeStudentKey looks up the discount that applies to one student for
// one fee type, independent of period.
type FeeStudentKey struct {
	FeeTypeID     uuid.UUID
	StudentUserID uuid.UUID
}

// BillCandidate is one bill PlanGeneration would create.
type BillCandidate struct {
	Key                 BillKey
	FeeType             FeeType
	StudentUserID       uuid.UUID
	OriginalAmountMinor int64
	DiscountAmountMinor int64
	AmountMinor         int64
}

// GenerationPlan is what PlanGeneration returns: the bills to create and
// how many candidates it left out because their key was already billed.
type GenerationPlan struct {
	Candidates    []BillCandidate
	AlreadyBilled int
}

// PlanGeneration computes the bills that charging feeTypes to students
// for period would create, applying each student's active discount for
// that fee type and skipping (and counting) any key already in existing.
// existing must be keyed by each fee type's own billing period
// (FeeType.BillingPeriod), so a one-off fee type billed earlier under its
// fixed period code is recognised as already billed for every month.
//
// This is the property the module is built around: calling PlanGeneration
// a second time with existing populated from the first call's own output
// always returns an empty plan, so running generation twice never
// double-charges a student. The unique constraint on bills is the
// belt-and-suspenders backstop; this function is the intended behavior.
func PlanGeneration(feeTypes []FeeType, students []StudentEnrollment, period string, discounts map[FeeStudentKey]Discount, existing map[BillKey]bool) GenerationPlan {
	var out GenerationPlan
	for _, ft := range feeTypes {
		if !ft.IsActive {
			continue
		}
		billPeriod := ft.BillingPeriod(period)
		for _, st := range students {
			key := BillKey{FeeTypeID: ft.ID, StudentUserID: st.StudentUserID, Period: billPeriod}
			if existing[key] {
				out.AlreadyBilled++
				continue
			}
			discountMinor := int64(0)
			if d, ok := discounts[FeeStudentKey{FeeTypeID: ft.ID, StudentUserID: st.StudentUserID}]; ok {
				discountMinor = d.Apply(ft.AmountMinor)
			}
			out.Candidates = append(out.Candidates, BillCandidate{
				Key: key, FeeType: ft, StudentUserID: st.StudentUserID,
				OriginalAmountMinor: ft.AmountMinor, DiscountAmountMinor: discountMinor,
				AmountMinor: ft.AmountMinor - discountMinor,
			})
		}
	}
	return out
}

// BillingPeriods is every period a generation run for period can bill
// under: the requested one plus each active one-off fee type's own fixed
// period, deduplicated. The existing-bill lookup must cover all of them.
func BillingPeriods(feeTypes []FeeType, period string) []string {
	seen := map[string]bool{period: true}
	out := []string{period}
	for _, ft := range feeTypes {
		if !ft.IsActive {
			continue
		}
		if p := ft.BillingPeriod(period); !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}
