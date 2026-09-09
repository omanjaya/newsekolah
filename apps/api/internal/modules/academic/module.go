// Package academic wires the academic module's repository, service, and
// HTTP transport together, and exports the read-only interfaces other
// modules use to depend on it (see README.md). cmd/api calls Register once
// at startup; nothing else constructs these types directly.
package academic

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Module struct {
	Service *service.Service
	Handler *transporthttp.AcademicHandler
}

func Register(pool *pgxpool.Pool, clk clock.Clock) *Module {
	repo := repository.New(pool)
	svc := service.New(pool, repo, clk)
	handler := transporthttp.New(svc, clk)
	return &Module{Service: svc, Handler: handler}
}
