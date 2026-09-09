// Package identity wires the identity module's repository, service, and
// HTTP transport together. cmd/api calls Register once at startup.
package identity

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool         *pgxpool.Pool
	Years        service.AcademicYearReader
	Limiter      service.RateLimiter
	Tokens       service.TokenIssuer
	Clock        clock.Clock
	Config       service.Config
	Branding     transporthttp.BrandingReader
	SessionCache transporthttp.SessionCache
	IsProduction bool
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.Handler
}

func Register(deps Dependencies) *Module {
	repo := repository.New(deps.Pool)
	svc := service.New(deps.Pool, repo, deps.Years, deps.Limiter, deps.Tokens, deps.Clock, deps.Config, auth.NewRefreshToken)
	handler := transporthttp.New(svc, deps.Branding, deps.SessionCache, deps.IsProduction)
	return &Module{Service: svc, Handler: handler}
}
