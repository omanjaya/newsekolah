// Package identity wires the identity module's repository, service, and
// HTTP transport together. cmd/api calls Register once at startup.
package identity

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/oidc"
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
	// AppOrigins allowlists the Origin header on a cookie-based refresh
	// (docs/08-security.md section 7).
	AppOrigins []string
	// PushDevices deletes a user's push devices on logout/revoke-all. nil
	// disables that (no notifications module wired).
	PushDevices service.PushDeviceRevoker

	// ResetLimiter bounds password-reset-request attempts per IP. Email is
	// where the reset link/OTP goes; a nil-noop sender still lets the flow
	// work in dev (the link ends up in the server log via Mailpit/no-op).
	// Storage is nil when S3 is not configured, which disables the avatar
	// upload endpoints with a clear error rather than a panic.
	ResetLimiter service.IPRateLimiter
	Email        notify.EmailSender
	Storage      *storage.Client
	// MfaSealer enables TOTP two-factor when set (platform/crypto). The
	// same sealer also encrypts a tenant's Google SSO client secret, so
	// setting it up enables both features' at-rest encryption.
	MfaSealer service.Sealer
	// Ceremony backs the passkey registration/login challenge exchange.
	// nil disables passkeys entirely (satisfied structurally by
	// platform/auth.RedisStore or platform/auth.MemoryStore).
	Ceremony service.CeremonyStore
	// GoogleHTTPClient is used to fetch Google's published JWKS for ID
	// token verification. Defaults to http.DefaultClient when nil.
	GoogleHTTPClient *http.Client
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.Handler
}

func Register(deps Dependencies) *Module {
	repo := repository.New(deps.Pool)

	// Constructing the verifier does not itself contact Google -- the JWKS
	// fetch only happens the first time a login actually needs a key --
	// so it is always wired up; whether Google SSO is usable at all comes
	// down to whether a tenant has a configuration row (service/sso_google.go).
	googleVerifier := googleVerifierAdapter{keys: oidc.NewGoogleKeySource(deps.GoogleHTTPClient)}

	svc := service.New(deps.Pool, repo, deps.Years, deps.Limiter, deps.Tokens, deps.Clock, deps.Config, auth.NewRefreshToken, service.Extras{
		ResetLimiter:   deps.ResetLimiter,
		Email:          deps.Email,
		Storage:        deps.Storage,
		MfaRepo:        repo,
		MfaSealer:      deps.MfaSealer,
		SSOSealer:      deps.MfaSealer,
		GoogleVerifier: googleVerifier,
		Ceremony:       deps.Ceremony,
		SessionCache:   deps.SessionCache,
		PushDevices:    deps.PushDevices,
	})
	handler := transporthttp.New(svc, deps.Branding, deps.SessionCache, deps.IsProduction, deps.AppOrigins)
	return &Module{Service: svc, Handler: handler}
}

// googleVerifierAdapter satisfies service.GoogleIDTokenVerifier with the
// package-level oidc.VerifyIDToken function, injecting the caller's clock
// so verification time is never taken from time.Now() directly.
type googleVerifierAdapter struct {
	keys oidc.KeySource
}

func (a googleVerifierAdapter) Verify(ctx context.Context, idToken, audience, hostedDomain string) (oidc.Claims, error) {
	return oidc.VerifyIDToken(ctx, a.keys, idToken, audience, hostedDomain, clock.Real{}.Now())
}
