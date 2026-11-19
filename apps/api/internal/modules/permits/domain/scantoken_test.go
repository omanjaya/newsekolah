package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTokenTTL(t *testing.T) {
	now := time.Date(2026, 3, 10, 7, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		purpose      Purpose
		periodEndsAt time.Time
		want         time.Duration
	}{
		{"classroom entry is short lived", PurposeClassroomEntry, time.Time{}, shortLivedTTL},
		{"late arrival is short lived", PurposeLateArrival, time.Time{}, shortLivedTTL},
		{"approve stage is short lived", PurposeApproveStage, time.Time{}, shortLivedTTL},
		{"gate exit lasts until period end", PurposeGateExit, now.Add(3 * time.Hour), 3 * time.Hour},
		{"gate exit past period end still grants a window", PurposeGateExit, now.Add(-time.Minute), shortLivedTTL},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, TokenTTL(tt.purpose, now, tt.periodEndsAt))
		})
	}
}

func TestPurposeValid(t *testing.T) {
	require.True(t, PurposeApproveStage.Valid())
	require.True(t, PurposeGateExit.Valid())
	require.False(t, Purpose("unknown").Valid())
}

func TestAcceptsUnboundApproval(t *testing.T) {
	exitStages := DefaultStages(KindExitPermit)
	lateStages := DefaultStages(KindLateArrival)
	leaveStages := DefaultStages(KindLeaveRequest)

	tests := []struct {
		name  string
		kind  Kind
		stage Stage
		want  bool
	}{
		{"exit permit duty_teacher stage", KindExitPermit, exitStages[0], true},
		{"exit permit class_teacher stage", KindExitPermit, exitStages[1], false},
		{"exit permit counselor stage", KindExitPermit, exitStages[2], false},
		{"exit permit leadership stage", KindExitPermit, exitStages[3], false},
		{"late arrival manual duty_teacher stage", KindLateArrival, lateStages[0], false},
		{"late arrival leadership stage", KindLateArrival, lateStages[1], false},
		{"late arrival class_teacher stage", KindLateArrival, lateStages[2], false},
		{"leave request homeroom stage", KindLeaveRequest, leaveStages[0], false},
		{
			"exit permit any_teacher stage verified by hand", KindExitPermit,
			Stage{Key: "duty_teacher", ApproverRule: RuleAnyTeacher, Verification: VerificationManual}, false,
		},
		{
			"late arrival any_teacher qr stage", KindLateArrival,
			Stage{Key: "duty_teacher", ApproverRule: RuleAnyTeacher, Verification: VerificationQRScan}, false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, AcceptsUnboundApproval(tt.kind, tt.stage))
		})
	}
}

func TestScanTokenState(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	fresh := ScanToken{ExpiresAt: now.Add(time.Minute)}
	require.False(t, fresh.IsExpired(now))
	require.False(t, fresh.IsConsumed())

	expired := ScanToken{ExpiresAt: now.Add(-time.Second)}
	require.True(t, expired.IsExpired(now))

	consumedAt := now
	consumed := ScanToken{ConsumedAt: &consumedAt}
	require.True(t, consumed.IsConsumed())
}
