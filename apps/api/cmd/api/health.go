package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

// healthHandler implements just the GetHealth operation of
// api.StrictServerInterface. It is wiring, not a module: liveness checks
// have no business rules of their own.
type healthHandler struct {
	version string
	pool    *pgxpool.Pool
	redis   *redis.Client // nil when REDIS_URL is empty
}

func (h *healthHandler) GetHealth(ctx context.Context, _ api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	checks := map[string]api.GetHealth200JSONResponseBodyChecks{}
	status := api.GetHealth200JSONResponseBodyStatusOk

	if err := h.pool.Ping(ctx); err != nil {
		checks["database"] = api.GetHealth200JSONResponseBodyChecksFail
		status = api.GetHealth200JSONResponseBodyStatusDegraded
	} else {
		checks["database"] = api.GetHealth200JSONResponseBodyChecksOk
	}

	if h.redis == nil {
		checks["redis"] = api.GetHealth200JSONResponseBodyChecksSkipped
	} else if err := h.redis.Ping(ctx).Err(); err != nil {
		checks["redis"] = api.GetHealth200JSONResponseBodyChecksFail
		status = api.GetHealth200JSONResponseBodyStatusDegraded
	} else {
		checks["redis"] = api.GetHealth200JSONResponseBodyChecksOk
	}

	version := h.version
	return api.GetHealth200JSONResponse{Status: status, Version: &version, Checks: checks}, nil
}
