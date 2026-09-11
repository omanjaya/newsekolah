package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func TestGenerateMemberNo(t *testing.T) {
	require.Equal(t, "PS-2026-00042", domain.GenerateMemberNo("PS-YYYY-99999", 2026, 42))
	require.Equal(t, "PS-2026-123456", domain.GenerateMemberNo("PS-YYYY-99999", 2026, 123456), "a sequence wider than the pattern is never truncated")
	require.Equal(t, "LIB2026-007", domain.GenerateMemberNo("LIBYYYY-999", 2026, 7))
}

func TestMemberEligibleToBorrow(t *testing.T) {
	suspendedUntil := day("2026-09-10")
	validUntil := day("2026-12-31")

	tests := []struct {
		name   string
		member domain.Member
		asOf   string
		want   error
	}{
		{"active and within validity", domain.Member{Status: domain.MemberActive, ValidUntil: &validUntil}, "2026-09-01", nil},
		{"active but past validity", domain.Member{Status: domain.MemberActive, ValidUntil: &validUntil}, "2027-01-01", domain.ErrMemberExpired},
		{"pending is not active", domain.Member{Status: domain.MemberPending}, "2026-09-01", domain.ErrMemberNotActive},
		{"inactive is not active", domain.Member{Status: domain.MemberInactive}, "2026-09-01", domain.ErrMemberNotActive},
		{"cleared is not active", domain.Member{Status: domain.MemberCleared}, "2026-09-01", domain.ErrMemberNotActive},
		{
			"suspended, still within the window", domain.Member{Status: domain.MemberSuspended, SuspendedUntil: &suspendedUntil},
			"2026-09-05", domain.ErrMemberSuspended,
		},
		{
			"suspended, window has passed: treated as active", domain.Member{Status: domain.MemberSuspended, SuspendedUntil: &suspendedUntil},
			"2026-09-11", nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.member.EligibleToBorrow(day(tt.asOf))
			if tt.want == nil {
				require.NoError(t, err)
				return
			}
			require.ErrorIs(t, err, tt.want)
		})
	}
}

func TestEligibleForClearance(t *testing.T) {
	require.True(t, domain.EligibleForClearance(0, false))
	require.False(t, domain.EligibleForClearance(1, false), "an active loan blocks clearance")
	require.False(t, domain.EligibleForClearance(0, true), "an unpaid fine blocks clearance")
}

func TestValidUntilFromRegistration(t *testing.T) {
	got := domain.ValidUntilFromRegistration(day("2026-01-15"), 12)
	require.Equal(t, day("2027-01-15"), got)
}
