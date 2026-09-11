package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// fakeTimezoneRepo embeds the (nil) Repository interface so it satisfies
// every method the tests below do not call -- only GetTenantTimezone is
// actually implemented, which is all tenantLocation/tenantNow need.
type fakeTimezoneRepo struct {
	Repository
	timezone string
}

func (f fakeTimezoneRepo) GetTenantTimezone(context.Context, uuid.UUID) (string, error) {
	return f.timezone, nil
}

// TestTenantNow_NonUTCTenant is the regression test for
// docs/analysis/backend-inventory.md 1.15/1.16: gate-token expiry, the
// ForceStatus window, and the "teacher_of_class_now" approver rule must
// all read the clock in the tenant's own timezone, not the server's UTC
// one. 23:30 UTC is already the next calendar day, 06:30, in a
// Asia/Jakarta (UTC+7) tenant -- a naive s.clock.Now() would get both the
// wrong date and the wrong hour.
func TestTenantNow_NonUTCTenant(t *testing.T) {
	utcInstant := time.Date(2026, time.March, 10, 23, 30, 0, 0, time.UTC)
	svc := &Service{
		repo:  fakeTimezoneRepo{timezone: "Asia/Jakarta"},
		clock: clock.Frozen{At: utcInstant},
	}

	local := svc.tenantNow(context.Background(), uuid.New())

	require.Equal(t, "Asia/Jakarta", local.Location().String())
	require.Equal(t, time.March, local.Month())
	require.Equal(t, 11, local.Day(), "23:30 UTC is already the 11th in Asia/Jakarta")
	require.Equal(t, 6, local.Hour())
	require.Equal(t, 30, local.Minute())
	require.True(t, local.Equal(utcInstant), "must still be the same instant, only reinterpreted in the tenant's timezone")
}

// TestTenantLocation_FallsBackToUTC covers the two documented fallback
// cases: an unset timezone and an unrecognized IANA name.
func TestTenantLocation_FallsBackToUTC(t *testing.T) {
	cases := []string{"", "Not/A_Real_Zone"}
	for _, tz := range cases {
		svc := &Service{repo: fakeTimezoneRepo{timezone: tz}, clock: clock.Real{}}
		loc := svc.tenantLocation(context.Background(), uuid.New())
		require.Equal(t, time.UTC, loc)
	}
}

// TestCombineDateAndDuration_NonUTCTenant demonstrates the exact bug
// combineDateAndDuration's callers (IssueGateToken's periodEndsAt,
// GateScan's from/to) had before tenantNow replaced a raw s.clock.Now():
// combining a UTC instant directly with a period's wall-clock end time
// produces a different (wrong) absolute instant than combining the same
// instant reinterpreted in the tenant's own timezone first.
func TestCombineDateAndDuration_NonUTCTenant(t *testing.T) {
	utcInstant := time.Date(2026, time.March, 10, 23, 30, 0, 0, time.UTC)
	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)

	periodEndsAt := 15*time.Hour + 30*time.Minute // 15:30 wall-clock

	buggyResult := combineDateAndDuration(utcInstant, periodEndsAt)
	fixedResult := combineDateAndDuration(utcInstant.In(loc), periodEndsAt)

	require.False(t, buggyResult.Equal(fixedResult), "the UTC-naive and tenant-local combinations must disagree for this instant")
	require.Equal(t, 10, buggyResult.Day(), "the UTC-naive result stays on the wrong (server) calendar day")
	require.Equal(t, 11, fixedResult.Day(), "the tenant-local result lands on the correct calendar day")
}
