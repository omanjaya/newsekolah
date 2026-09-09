// Package database owns the pgx pool and the two transaction helpers every
// repository goes through: WithTenantTx for tenant-scoped work and
// WithPlatformTx for cross-tenant platform operations. Both exist so that
// `SET LOCAL app.tenant_id` (or app.platform_admin) is never left to
// individual services to remember.
package database

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ctxKey int

const txKey ctxKey = iota

// NewPool opens a pgx connection pool against dsn.
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open database pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

// TxFromContext returns the transaction started by WithTenantTx or
// WithPlatformTx for the current call chain. Repositories call this instead
// of accepting a pool directly, so a repository never opens its own
// transaction (only services do).
func TxFromContext(ctx context.Context) (pgx.Tx, bool) {
	tx, ok := ctx.Value(txKey).(pgx.Tx)
	return tx, ok
}

// WithTenantTx begins a transaction, sets app.tenant_id for the lifetime of
// that transaction (so RLS policies apply), runs fn, and commits. Any error
// from fn rolls the transaction back.
func WithTenantTx(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return withTx(ctx, pool, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "select set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
			return fmt.Errorf("set tenant context: %w", err)
		}
		return fn(ctx)
	})
}

// WithPlatformTx begins a transaction and sets app.platform_admin = 'true'
// for the lifetime of that transaction. Only tables in the "platform"
// category (tenant_settings, tenant_policies, feature_flags, assets,
// audit_logs) declare a policy that honours this flag; every other
// tenant-scoped table stays isolated regardless.
func WithPlatformTx(ctx context.Context, pool *pgxpool.Pool, fn func(ctx context.Context) error) error {
	return withTx(ctx, pool, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "select set_config('app.platform_admin', 'true', true)"); err != nil {
			return fmt.Errorf("set platform context: %w", err)
		}
		return fn(ctx)
	})
}

func withTx(ctx context.Context, pool *pgxpool.Pool, fn func(ctx context.Context, tx pgx.Tx) error) (err error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
			return
		}
		err = tx.Commit(ctx)
	}()

	err = fn(context.WithValue(ctx, txKey, tx), tx)
	return err
}
