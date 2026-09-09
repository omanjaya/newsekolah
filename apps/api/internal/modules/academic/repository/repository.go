// Package repository implements academic/service.Repository using sqlc's
// generated Queries, per docs/03-layered-architecture.md section 1: it
// holds no business rules, only mapping between domain types and the
// generated db.* row types.
package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
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

// clockTime converts a Postgres `time` column to domain.ClockTime and back.
// Kept here rather than in platform/database/convert.go since only this
// module's periods use a bare time-of-day column.
func clockTimeToPg(hour, minute int) pgtype.Time {
	return pgtype.Time{Microseconds: int64(hour)*3600e6 + int64(minute)*60e6, Valid: true}
}

func pgToClockTime(t pgtype.Time) (hour, minute int) {
	total := t.Microseconds / 1e6 / 60 // whole minutes since midnight
	return int(total / 60), int(total % 60)
}
