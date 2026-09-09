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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
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

	// ResetLimiter bounds password-reset-request attempts per IP. Email is
	// where the reset link/OTP goes; a nil-noop sender still lets the flow
	// work in dev (the link ends up in the server log via Mailpit/no-op).
	// Storage is nil when S3 is not configured, which disables the avatar
	// upload endpoints with a clear error rather than a panic.
	ResetLimiter service.IPRateLimiter
	Email        notify.EmailSender
	Storage      *storage.Client
	// MfaSealer enables TOTP two-factor when set (platform/crypto).
	MfaSealer service.Sealer
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.Handler
}

func Register(deps Dependencies) *Module {
	repo := repository.New(deps.Pool)
	svc := service.New(deps.Pool, repo, deps.Years, deps.Limiter, deps.Tokens, deps.Clock, deps.Config, auth.NewRefreshToken, service.Extras{
		ResetLimiter: deps.ResetLimiter,
		Email:        deps.Email,
		Storage:      deps.Storage,
		MfaRepo:      repo,
		MfaSealer:    deps.MfaSealer,
	})
	handler := transporthttp.New(svc, deps.Branding, deps.SessionCache, deps.IsProduction)
	return &Module{Service: svc, Handler: handler}
}
