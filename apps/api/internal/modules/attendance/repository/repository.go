// Package repository implements attendance/service.Repository using
// sqlc's generated Queries, per docs/03-layered-architecture.md section 1:
// domain, gen/db, and platform/database only -- no chi, no service.
package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}
