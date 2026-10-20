package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Tables whose monthly partitions this service manages. The names are also
// the allow-list inside the ensure/drop SQL functions (migrations/0123).
const (
	TableAuditLogs     = "audit_logs"
	TableLoginAttempts = "login_attempts"
)

const (
	// partitionsAhead is how many months after the current one are kept
	// created, so a missed job run never lets traffic reach the DEFAULT
	// partition.
	partitionsAhead = 2

	// retentionBatchSize bounds one DELETE; retentionMaxBatches bounds how
	// many batches one tenant gets per run, so a large backlog is drained
	// over several daily runs instead of monopolising a connection.
	retentionBatchSize  = 5000
	retentionMaxBatches = 200
)

// EnsurePartitionsArgs and RunRetentionArgs carry no payload: each run
// processes every tenant and table itself, like the notifications
// maintenance jobs.
type EnsurePartitionsArgs struct{}

func (EnsurePartitionsArgs) Kind() string { return "platform.ensure_partitions" }

type RunRetentionArgs struct{}

func (RunRetentionArgs) Kind() string { return "platform.run_retention" }

// RetentionPolicy sets how long each kind of data is kept. A zero value
// disables that rule (config.Load enforces sensible minimums and defaults).
type RetentionPolicy struct {
	AuditLogMonths      int
	LoginAttemptDays    int
	WebhookDeliveryDays int
}

// MaintenanceRepository is the data-access boundary of the partition and
// retention jobs.
type MaintenanceRepository interface {
	EnsureMonthlyPartition(ctx context.Context, table string, month time.Time) error
	DropExpiredPartitions(ctx context.Context, table string, cutoff time.Time) ([]string, error)
	ListRetentionTenantIDs(ctx context.Context) ([]uuid.UUID, error)
	DeleteLoginAttemptsBefore(ctx context.Context, tenantID uuid.UUID, cutoff time.Time, batchSize int) (int64, error)
	DeleteWebhookDeliveriesBefore(ctx context.Context, tenantID uuid.UUID, cutoff time.Time, batchSize int) (int64, error)
}

// Maintenance keeps the audit_logs and login_attempts monthly partitions
// created ahead of traffic and enforces the retention policy:
//
//   - audit_logs: whole partitions are dropped once their month is entirely
//     older than the cutoff. Rows are never DELETEd, so the table stays
//     append-only for the application. The effective period is the
//     configured one plus up to one month.
//   - login_attempts: old partitions are dropped, then rows older than the
//     exact cutoff in the remaining partitions are deleted in batches.
//   - integration_webhook_deliveries (not partitioned): finished deliveries
//     older than the cutoff are deleted in batches, one tenant at a time.
//
// Rows that ended up in a DEFAULT partition (a month nobody created a
// partition for) are intentionally left alone: after migration 0124 the
// DEFAULT partitions are empty, and the next ensure run moves any stragglers
// into a proper partition.
type Maintenance struct {
	repo   MaintenanceRepository
	clock  clock.Clock
	policy RetentionPolicy
	logger *slog.Logger
	// inTenantTx runs fn in a tenant-scoped transaction (RLS applies to the
	// batch deletes); a field so unit tests need no database.
	inTenantTx func(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error
}

func NewMaintenance(pool *pgxpool.Pool, repo MaintenanceRepository, clk clock.Clock, policy RetentionPolicy, logger *slog.Logger) *Maintenance {
	if logger == nil {
		logger = slog.Default()
	}
	return &Maintenance{
		repo: repo, clock: clk, policy: policy, logger: logger,
		inTenantTx: func(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
			return database.WithTenantTx(ctx, pool, tenantID, fn)
		},
	}
}

// EnsurePartitions creates the partitions for the current month and the next
// two, for every managed table. Safe to run repeatedly and at any time.
func (m *Maintenance) EnsurePartitions(ctx context.Context) error {
	var errs []error
	for _, table := range []string{TableAuditLogs, TableLoginAttempts} {
		for _, month := range PartitionMonths(m.clock.Now(), partitionsAhead) {
			if err := m.repo.EnsureMonthlyPartition(ctx, table, month); err != nil {
				errs = append(errs, err)
			}
		}
	}
	return errors.Join(errs...)
}

// RunRetention applies the retention policy. Each rule is independent: one
// failing never prevents the others from running; all errors are returned
// together so River retries the job.
func (m *Maintenance) RunRetention(ctx context.Context) error {
	now := m.clock.Now()
	var errs []error

	if cutoff, ok := MonthsCutoff(now, m.policy.AuditLogMonths); ok {
		m.dropPartitions(ctx, TableAuditLogs, cutoff, &errs)
	}
	if cutoff, ok := DaysCutoff(now, m.policy.LoginAttemptDays); ok {
		m.dropPartitions(ctx, TableLoginAttempts, cutoff, &errs)
		errs = append(errs, m.deletePerTenant(ctx, "login_attempts", cutoff, m.repo.DeleteLoginAttemptsBefore)...)
	}
	if cutoff, ok := DaysCutoff(now, m.policy.WebhookDeliveryDays); ok {
		errs = append(errs, m.deletePerTenant(ctx, "integration_webhook_deliveries", cutoff, m.repo.DeleteWebhookDeliveriesBefore)...)
	}
	return errors.Join(errs...)
}

func (m *Maintenance) dropPartitions(ctx context.Context, table string, cutoff time.Time, errs *[]error) {
	dropped, err := m.repo.DropExpiredPartitions(ctx, table, cutoff)
	if err != nil {
		*errs = append(*errs, err)
		return
	}
	for _, name := range dropped {
		m.logger.Info("dropped expired partition", "table", table, "partition", name, "cutoff", cutoff)
	}
}

type batchDeleter func(ctx context.Context, tenantID uuid.UUID, cutoff time.Time, batchSize int) (int64, error)

// deletePerTenant deletes rows older than cutoff for every tenant, one small
// transaction per batch so no single statement or lock lasts long.
func (m *Maintenance) deletePerTenant(ctx context.Context, what string, cutoff time.Time, del batchDeleter) []error {
	tenantIDs, err := m.repo.ListRetentionTenantIDs(ctx)
	if err != nil {
		return []error{fmt.Errorf("list tenants for %s retention: %w", what, err)}
	}
	var errs []error
	for _, tenantID := range tenantIDs {
		var total int64
		for range retentionMaxBatches {
			var n int64
			err := m.inTenantTx(ctx, tenantID, func(ctx context.Context) error {
				var derr error
				n, derr = del(ctx, tenantID, cutoff, retentionBatchSize)
				return derr
			})
			if err != nil {
				errs = append(errs, fmt.Errorf("%s retention for tenant %s: %w", what, tenantID, err))
				break
			}
			total += n
			if n < retentionBatchSize {
				break
			}
		}
		if total > 0 {
			m.logger.Info("deleted expired rows", "table", what, "tenant_id", tenantID, "rows", total)
		}
	}
	return errs
}

// PartitionMonths returns the first day (UTC) of the month containing now
// and of each of the following ahead months.
func PartitionMonths(now time.Time, ahead int) []time.Time {
	now = now.UTC()
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	months := make([]time.Time, 0, ahead+1)
	for offset := 0; offset <= ahead; offset++ {
		months = append(months, first.AddDate(0, offset, 0))
	}
	return months
}

// PartitionName is the name migrations/0123 gives a monthly partition,
// e.g. audit_logs_y2026m10.
func PartitionName(table string, month time.Time) string {
	return fmt.Sprintf("%s_y%04dm%02d", table, month.UTC().Year(), int(month.UTC().Month()))
}

// MonthsCutoff is the instant before which audit data is expired; ok is
// false when the rule is disabled. Because whole partitions are dropped,
// only months that end at or before the cutoff go.
func MonthsCutoff(now time.Time, months int) (time.Time, bool) {
	if months <= 0 {
		return time.Time{}, false
	}
	return now.UTC().AddDate(0, -months, 0), true
}

// DaysCutoff is the instant before which rows are expired; ok is false when
// the rule is disabled.
func DaysCutoff(now time.Time, days int) (time.Time, bool) {
	if days <= 0 {
		return time.Time{}, false
	}
	return now.UTC().AddDate(0, 0, -days), true
}
