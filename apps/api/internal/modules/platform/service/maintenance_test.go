package service

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

func TestPartitionMonths(t *testing.T) {
	cases := []struct {
		name string
		now  time.Time
		want []string
	}{
		{"mid month", time.Date(2026, 10, 10, 14, 30, 0, 0, time.UTC), []string{"2026-10-01", "2026-11-01", "2026-12-01"}},
		{"year rollover", time.Date(2026, 11, 30, 23, 59, 59, 0, time.UTC), []string{"2026-11-01", "2026-12-01", "2027-01-01"}},
		{"january", time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), []string{"2027-01-01", "2027-02-01", "2027-03-01"}},
		{"31st does not skip a month", time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC), []string{"2026-01-01", "2026-02-01", "2026-03-01"}},
		{"non-UTC input is converted first", time.Date(2026, 10, 1, 3, 0, 0, 0, time.FixedZone("WITA", 8*3600)), []string{"2026-09-01", "2026-10-01", "2026-11-01"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got []string
			for _, m := range PartitionMonths(tc.now, 2) {
				got = append(got, m.Format("2006-01-02"))
				require.Equal(t, time.UTC, m.Location())
			}
			require.Equal(t, tc.want, got)
		})
	}
}

func TestPartitionName(t *testing.T) {
	require.Equal(t, "audit_logs_y2026m10", PartitionName(TableAuditLogs, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)))
	require.Equal(t, "login_attempts_y2027m01", PartitionName(TableLoginAttempts, time.Date(2027, 1, 15, 0, 0, 0, 0, time.UTC)))
	// Same month as seen from UTC+8 just after midnight on the 1st.
	require.Equal(t, "audit_logs_y2026m09", PartitionName(TableAuditLogs, time.Date(2026, 10, 1, 2, 0, 0, 0, time.FixedZone("WITA", 8*3600))))
}

func TestCutoffs(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

	got, ok := MonthsCutoff(now, 24)
	require.True(t, ok)
	require.Equal(t, time.Date(2024, 10, 10, 12, 0, 0, 0, time.UTC), got)

	got, ok = DaysCutoff(now, 90)
	require.True(t, ok)
	require.Equal(t, time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC), got)

	got, ok = DaysCutoff(now, 30)
	require.True(t, ok)
	require.Equal(t, time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC), got)

	_, ok = MonthsCutoff(now, 0)
	require.False(t, ok, "zero disables the rule")
	_, ok = DaysCutoff(now, 0)
	require.False(t, ok, "zero disables the rule")
}

type fakeMaintenanceRepo struct {
	ensured    []string
	dropped    map[string]time.Time
	dropErr    map[string]error
	tenants    []uuid.UUID
	loginLeft  map[uuid.UUID]int64
	hookLeft   map[uuid.UUID]int64
	loginCalls int
	cutoffs    map[string]time.Time
}

func (f *fakeMaintenanceRepo) EnsureMonthlyPartition(_ context.Context, table string, month time.Time) error {
	f.ensured = append(f.ensured, PartitionName(table, month))
	return nil
}

func (f *fakeMaintenanceRepo) DropExpiredPartitions(_ context.Context, table string, cutoff time.Time) ([]string, error) {
	if f.dropped == nil {
		f.dropped = map[string]time.Time{}
	}
	f.dropped[table] = cutoff
	return nil, f.dropErr[table]
}

func (f *fakeMaintenanceRepo) ListRetentionTenantIDs(context.Context) ([]uuid.UUID, error) {
	return f.tenants, nil
}

func (f *fakeMaintenanceRepo) drain(left map[uuid.UUID]int64, tenant uuid.UUID, batch int) int64 {
	n := min(left[tenant], int64(batch))
	left[tenant] -= n
	return n
}

func (f *fakeMaintenanceRepo) DeleteLoginAttemptsBefore(_ context.Context, tenant uuid.UUID, cutoff time.Time, batch int) (int64, error) {
	f.loginCalls++
	f.cutoffs["login_attempts"] = cutoff
	return f.drain(f.loginLeft, tenant, batch), nil
}

func (f *fakeMaintenanceRepo) DeleteWebhookDeliveriesBefore(_ context.Context, tenant uuid.UUID, cutoff time.Time, batch int) (int64, error) {
	f.cutoffs["webhooks"] = cutoff
	return f.drain(f.hookLeft, tenant, batch), nil
}

func newTestMaintenance(repo *fakeMaintenanceRepo, policy RetentionPolicy, now time.Time) *Maintenance {
	return &Maintenance{
		repo: repo, clock: clock.Frozen{At: now}, policy: policy,
		inTenantTx: func(ctx context.Context, _ uuid.UUID, fn func(context.Context) error) error { return fn(ctx) },
		logger:     discardLogger(),
	}
}

func TestEnsurePartitions_CoversCurrentAndNextTwoMonthsForBothTables(t *testing.T) {
	repo := &fakeMaintenanceRepo{}
	m := newTestMaintenance(repo, RetentionPolicy{}, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC))

	require.NoError(t, m.EnsurePartitions(context.Background()))
	require.Equal(t, []string{
		"audit_logs_y2026m11", "audit_logs_y2026m12", "audit_logs_y2027m01",
		"login_attempts_y2026m11", "login_attempts_y2026m12", "login_attempts_y2027m01",
	}, repo.ensured)
}

func TestRunRetention_AppliesConfiguredCutoffs(t *testing.T) {
	tenant := uuid.New()
	repo := &fakeMaintenanceRepo{
		tenants:   []uuid.UUID{tenant},
		loginLeft: map[uuid.UUID]int64{tenant: 12000},
		hookLeft:  map[uuid.UUID]int64{tenant: 10},
		cutoffs:   map[string]time.Time{},
	}
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	m := newTestMaintenance(repo, RetentionPolicy{AuditLogMonths: 24, LoginAttemptDays: 90, WebhookDeliveryDays: 30}, now)

	require.NoError(t, m.RunRetention(context.Background()))

	require.Equal(t, time.Date(2024, 10, 10, 12, 0, 0, 0, time.UTC), repo.dropped[TableAuditLogs])
	require.Equal(t, time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC), repo.dropped[TableLoginAttempts])
	require.Equal(t, repo.dropped[TableLoginAttempts], repo.cutoffs["login_attempts"])
	require.Equal(t, time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC), repo.cutoffs["webhooks"])
	// 12000 rows at 5000 per batch: 5000, 5000, 2000 (short batch stops the loop).
	require.Equal(t, 3, repo.loginCalls)
	require.Zero(t, repo.loginLeft[tenant])
	require.Zero(t, repo.hookLeft[tenant])
}

func TestRunRetention_ZeroDisablesEachRule(t *testing.T) {
	repo := &fakeMaintenanceRepo{tenants: []uuid.UUID{uuid.New()}, cutoffs: map[string]time.Time{}}
	m := newTestMaintenance(repo, RetentionPolicy{}, time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC))

	require.NoError(t, m.RunRetention(context.Background()))
	require.Empty(t, repo.dropped)
	require.Empty(t, repo.cutoffs)
}

func TestRunRetention_OneFailureDoesNotStopTheOtherRules(t *testing.T) {
	boom := errors.New("lock timeout")
	tenant := uuid.New()
	repo := &fakeMaintenanceRepo{
		dropErr:  map[string]error{TableAuditLogs: boom},
		tenants:  []uuid.UUID{tenant},
		hookLeft: map[uuid.UUID]int64{tenant: 1},
		cutoffs:  map[string]time.Time{},
	}
	m := newTestMaintenance(repo, RetentionPolicy{AuditLogMonths: 24, WebhookDeliveryDays: 30}, time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC))

	err := m.RunRetention(context.Background())
	require.ErrorIs(t, err, boom)
	require.Contains(t, repo.cutoffs, "webhooks", "webhook cleanup still ran")
}

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }
