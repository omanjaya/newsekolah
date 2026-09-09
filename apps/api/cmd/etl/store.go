package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store performs the target-side writes for one ETL run, inside a single
// transaction so a dry run can roll everything back at the end instead of
// needing an if-dryRun guard around every statement.
type Store struct {
	tx       pgx.Tx
	tenantID uuid.UUID
}

// runInTransaction opens one transaction, sets app.tenant_id for the RLS
// policies every target table enforces (mirroring
// apps/api/internal/platform/database.WithTenantTx), runs fn, and either
// commits or rolls back depending on dryRun. Rolling back on dry run --
// rather than skipping individual writes -- guarantees nothing persists even
// if a future write forgets to check the flag, and it exercises the same
// constraints (unique keys, foreign keys, exclusion constraints) a real run
// would hit.
func runInTransaction(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, dryRun bool, fn func(*Store) error) (err error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() {
		if err != nil || dryRun {
			_ = tx.Rollback(ctx)
			return
		}
		err = tx.Commit(ctx)
	}()

	if _, err = tx.Exec(ctx, "select set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return fmt.Errorf("set tenant context: %w", err)
	}
	return fn(&Store{tx: tx, tenantID: tenantID})
}

// savepointCounter gives every row-level statement a distinct savepoint
// name; a plain, reused name would nest incorrectly if a caller (mistakenly)
// issued two without releasing the first.
var savepointCounter int

// withRowSavepoint runs fn inside a SAVEPOINT and rolls back to it (instead
// of leaving the whole migration transaction aborted) when fn fails. Several
// target tables enforce constraints the source data can violate in ways a
// natural-key lookup does not fully prevent (a stale foreign key, a
// scheduling overlap the old system allowed): without a savepoint, one bad
// row would poison every statement after it for the rest of the run.
func (st *Store) withRowSavepoint(ctx context.Context, fn func() error) error {
	savepointCounter++
	name := fmt.Sprintf("etl_row_%d", savepointCounter)
	if _, err := st.tx.Exec(ctx, "savepoint "+name); err != nil {
		return fmt.Errorf("open savepoint: %w", err)
	}
	if err := fn(); err != nil {
		if _, rbErr := st.tx.Exec(ctx, "rollback to savepoint "+name); rbErr != nil {
			return fmt.Errorf("%w (also failed to roll back savepoint: %v)", err, rbErr)
		}
		return err
	}
	if _, err := st.tx.Exec(ctx, "release savepoint "+name); err != nil {
		return fmt.Errorf("release savepoint: %w", err)
	}
	return nil
}

// upsertOne runs an "insert ... on conflict ... do update ... returning id,
// (xmax = 0) as inserted" statement, inside its own savepoint, and reports
// whether the row was newly created (xmax = 0, the row's own just-inserted
// transaction ID) or already existed and was updated.
func (st *Store) upsertOne(ctx context.Context, query string, args ...any) (id uuid.UUID, created bool, err error) {
	err = st.withRowSavepoint(ctx, func() error {
		return st.tx.QueryRow(ctx, query, args...).Scan(&id, &created)
	})
	if err != nil {
		return uuid.Nil, false, err
	}
	return id, created, nil
}

// execRow runs a plain insert/update statement inside its own savepoint, for
// the writes that have no "on conflict ... returning" form (a select-then-
// branch upsert, or an update with no interesting return value).
func (st *Store) execRow(ctx context.Context, query string, args ...any) error {
	return st.withRowSavepoint(ctx, func() error {
		_, err := st.tx.Exec(ctx, query, args...)
		return err
	})
}

// selectID runs a lookup query expected to return zero or one uuid. It
// reports found=false rather than an error when no row matches, since "not
// found yet" is the normal case for a dependency an earlier migration step
// has not created.
func (st *Store) selectID(ctx context.Context, query string, args ...any) (id uuid.UUID, found bool, err error) {
	err = st.tx.QueryRow(ctx, query, args...).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, false, nil
		}
		return uuid.Nil, false, err
	}
	return id, true, nil
}
