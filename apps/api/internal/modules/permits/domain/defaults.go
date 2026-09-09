package domain

// DefaultStages returns the built-in stage list for kind, identical to the
// old SION app's hardcoded flow (docs/analysis/backend-inventory.md
// 1.14-1.16) so switching a tenant onto the configurable workflow engine
// changes zero behaviour by default. service.EnsureDefaultDefinitions
// persists this as version 1 the first time a tenant needs a definition
// that does not exist yet; a tenant can then edit or replace it without
// any code change.
func DefaultStages(kind Kind) []Stage {
	switch kind {
	case KindExitPermit:
		return []Stage{
			{
				Key: "duty_teacher", Label: "Guru piket", ApproverRule: "any_teacher",
				Verification: VerificationQRScan,
			},
			{
				Key: "class_teacher", Label: "Guru kelas", ApproverRule: "teacher_of_class_now",
				Verification: VerificationQRScan, DistinctFrom: []string{"duty_teacher"}, LookaheadSlots: 2,
			},
			{
				Key: "counselor", Label: "Guru BK", ApproverRule: "duty:counselor",
				Verification: VerificationQRScan, DistinctFrom: []string{"duty_teacher", "class_teacher"},
			},
			{
				Key: "leadership", Label: "Pimpinan", ApproverRule: "duty:leadership",
				Verification: VerificationQRScan, DistinctFrom: []string{"duty_teacher", "class_teacher", "counselor"},
			},
		}
	case KindLateArrival:
		return []Stage{
			// Opening (a student scanning any teacher's QR to check in as
			// late) is a separate event from this stage's approval: this
			// stage is satisfied by that teacher's manual review (reason,
			// violations, homeroom_reported), not by the scan itself --
			// see docs/analysis/backend-inventory.md 1.16.
			{
				Key: "duty_teacher", Label: "Guru piket", ApproverRule: "any_teacher",
				Verification: VerificationManual,
			},
			{
				Key: "leadership", Label: "Pimpinan", ApproverRule: "duty:leadership",
				Verification: VerificationQRScan, DistinctFrom: []string{"duty_teacher"},
			},
			{
				Key: "class_teacher", Label: "Guru kelas", ApproverRule: "teacher_of_class_now",
				Verification: VerificationQRScan, DistinctFrom: []string{"duty_teacher", "leadership"}, LookaheadSlots: 2,
			},
		}
	case KindLeaveRequest:
		return []Stage{
			{
				Key: "homeroom", Label: "Wali kelas", ApproverRule: "homeroom_of_student",
				Verification: VerificationManual,
			},
			{
				Key: "counselor", Label: "Guru BK", ApproverRule: "duty:counselor",
				Verification: VerificationManual, DistinctFrom: []string{"homeroom"},
			},
		}
	default:
		return nil
	}
}
