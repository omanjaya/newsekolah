// Package school wires the school module's repository, service, and HTTP
// transport together. cmd/api calls Register once at startup; nothing else
// constructs these types directly.
package school

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type Module struct {
	Service *service.Service
	Handler *transporthttp.TenantHandler
	// Loader is exported so cmd/api can pass it to tenant.Middleware without
	// platform/tenant importing this module.
	Loader tenant.Loader
}

func Register(pool *pgxpool.Pool, mode tenant.Mode) *Module {
	repo := repository.New(pool)
	svc := service.New(pool, repo, mode)
	handler := transporthttp.New(svc)
	return &Module{Service: svc, Handler: handler, Loader: repo}
}
