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

// PlanGeneration computes the bills that charging feeTypes to students
// for period would create, applying each student's active discount for
// that fee type and skipping any key already in existing.
//
// This is the property the module is built around: calling PlanGeneration
// a second time with existing populated from the first call's own output
// always returns an empty plan, so running generation twice never
// double-charges a student. The unique constraint on bills is the
// belt-and-suspenders backstop; this function is the intended behavior.
func PlanGeneration(feeTypes []FeeType, students []StudentEnrollment, period string, discounts map[FeeStudentKey]Discount, existing map[BillKey]bool) []BillCandidate {
	var out []BillCandidate
	for _, ft := range feeTypes {
		if !ft.IsActive {
			continue
		}
		billPeriod := ft.BillingPeriod(period)
		for _, st := range students {
			key := BillKey{FeeTypeID: ft.ID, StudentUserID: st.StudentUserID, Period: billPeriod}
			if existing[key] {
				continue
			}
			discountMinor := int64(0)
			if d, ok := discounts[FeeStudentKey{FeeTypeID: ft.ID, StudentUserID: st.StudentUserID}]; ok {
				discountMinor = d.Apply(ft.AmountMinor)
			}
			out = append(out, BillCandidate{
				Key: key, FeeType: ft, StudentUserID: st.StudentUserID,
				OriginalAmountMinor: ft.AmountMinor, DiscountAmountMinor: discountMinor,
				AmountMinor: ft.AmountMinor - discountMinor,
			})
		}
	}
	return out
}
