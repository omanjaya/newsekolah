// Package jobs owns the River client used for both enqueueing (from
// service code, in the same transaction as the domain write) and working
// jobs (cmd/worker). No module registers a job kind yet in this phase;
// modules that need one call river.AddWorker on the *Workers this package
// builds, before NewClient is called.
package jobs

import (
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

// NewWorkers returns an empty registry for modules to add job kinds to.
func NewWorkers() *river.Workers {
	return river.NewWorkers()
}

// NewClient builds a River client against pool. An empty *river.Workers
// (e.g. from cmd/api, which enqueues jobs but does not work them) is fine
// as long as the client's Start is never called -- docs/09-tech-stack.md
// notes cmd/worker can share a process with cmd/api for small schools, but
// does not have to.
func NewClient(pool *pgxpool.Pool, workers *river.Workers, logger *slog.Logger) (*river.Client[pgx.Tx], error) {
	if workers == nil {
		workers = NewWorkers()
	}
	return river.NewClient(riverpgxv5.New(pool), &river.Config{
		Logger:  logger,
		Queues:  map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 10}},
		Workers: workers,
	})
}
