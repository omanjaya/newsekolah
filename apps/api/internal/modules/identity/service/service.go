// Package service implements identity's use cases: login, refresh rotation,
// session management, effective-permission computation, and password
// change. It orchestrates the Repository and Clock but holds no SQL and no
// HTTP concerns, per docs/03-layered-architecture.md section 1.
package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

// Repository is identity's data-access boundary. The concrete
// implementation lives in repository/ and is backed by sqlc; this
// interface is declared here (the consumer), not there, per the layering
// rule that a repository interface belongs to its service. It is composed
// of one embedded interface per feature area (auth below, administration
// features in their own files) so each stays small enough to read on its
// own; repository.Repository implements all of them on one struct.
type Repository interface {
	AuthRepository
	UsersAdminRepository
	RolesRepository
	DutiesRepository
	StudentClassRepository
	ImpersonationRepository
	PasswordResetRepository
	ProfileRepository
	AuditRepository
	SSORepository
	PasskeyRepository
}

// AuthRepository is login, session, and effective-permission lookup: the
// original Phase 0 surface of identity, unchanged by the admin features
// added around it.
type AuthRepository interface {
	GetUserByUsername(ctx context.Context, tenantID uuid.UUID, username string) (domain.User, error)
	GetUserByID(ctx context.Context, tenantID, userID uuid.UUID) (domain.User, error)
	UpdateUserPassword(ctx context.Context, tenantID, userID uuid.UUID, passwordHash string) error
	UpdateLastLogin(ctx context.Context, tenantID, userID uuid.UUID, at time.Time) error
	RecordLoginAttempt(ctx context.Context, tenantID uuid.UUID, username, ip string, success bool) error

	ListRolesForUser(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Role, error)
	ListPermissionCodesForRoles(ctx context.Context, roleIDs []uuid.UUID) ([]string, error)
	ListActiveDuties(ctx context.Context, tenantID, userID, academicYearID uuid.UUID) ([]authz.Duty, error)
	ListUserIDsWithActiveDuty(ctx context.Context, tenantID uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error)

	CreateSession(ctx context.Context, s NewSession) (domain.Session, error)
	GetSessionByRefreshHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.Session, error)
	RevokeSession(ctx context.Context, tenantID, sessionID uuid.UUID, reason string) error
	// RevokeSessionFamily and RevokeOtherSessions return the ids they
	// revoked so the caller can evict them from the session cache
	// immediately (docs/analysis/backend-inventory.md section 1.1).
	RevokeSessionFamily(ctx context.Context, tenantID, familyID uuid.UUID, reason string) ([]uuid.UUID, error)
	RevokeOtherSessions(ctx context.Context, tenantID, userID, keepSessionID uuid.UUID, reason string) ([]uuid.UUID, error)
	ListActiveSessions(ctx context.Context, tenantID, userID uuid.UUID) ([]SessionView, error)
	IsSessionActive(ctx context.Context, tenantID, sessionID uuid.UUID) (bool, error)
	TouchSessionLastSeen(ctx context.Context, tenantID, sessionID uuid.UUID) error
	// PruneOldSessions deletes revoked/expired sessions older than 30 days
	// and returns how many rows it removed, for the periodic retention job.
	PruneOldSessions(ctx context.Context, tenantID uuid.UUID) (int64, error)
	// ListActiveTenants backs the same periodic job: it loops every tenant
	// one at a time rather than pruning across tenants in one statement.
	ListActiveTenants(ctx context.Context) ([]uuid.UUID, error)

	GetAuthSettings(ctx context.Context, tenantID uuid.UUID) (domain.AuthSettings, error)
	SetAuthSettings(ctx context.Context, tenantID, actorID uuid.UUID, in domain.AuthSettings) error

	// ActiveUsersByProfileKind and LoginHistogramByHour back the admin
	// dashboard (modules/analytics), which reaches them through
	// DashboardCounts/DashboardLoginHistogram below rather than calling
	// these directly.
	ActiveUsersByProfileKind(ctx context.Context, tenantID uuid.UUID) (map[string]int, error)
	LoginHistogramByHour(ctx context.Context, tenantID uuid.UUID, since time.Time, tz string) (map[int]int, error)
	// GetTenantTimezone resolves the IANA name DashboardLoginHistogram
	// buckets logins in, so the chart reads against the hours staff
	// actually work rather than the server's UTC clock.
	GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error)
}

// NewSession is what the service asks the repository to persist when
// issuing a fresh (or rotated) refresh token.
type NewSession struct {
	TenantID         uuid.UUID
	UserID           uuid.UUID
	Kind             string
	FamilyID         uuid.UUID
	RefreshTokenHash []byte
	Client           domain.ClientKind
	DeviceID         string
	DeviceName       string
	UserAgent        string
	IP               string
	ExpiresAt        time.Time
}

// AcademicYearReader is the narrow interface identity needs from the
// school module (the active academic year scopes duty-derived
// permissions). Wired in cmd/api; see docs/03 section 1 on cross-module
// communication.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
	ActiveAcademicYearLabel(ctx context.Context, tenantID, academicYearID uuid.UUID) (string, error)
}

// RateLimiter matches platform/auth.LoginRateLimiter's Allow signature
// structurally, so this package does not need to import platform/auth.
type RateLimiter interface {
	Allow(ctx context.Context, tenantID, username, ip string) (bool, error)
}

// TokenIssuer matches platform/auth.TokenIssuer's IssueAccessToken
// signature structurally.
type TokenIssuer interface {
	IssueAccessToken(userID, tenantID, sessionID uuid.UUID, roles []string, now time.Time) (string, time.Time, error)
	// IssueImpersonationAccessToken matches
	// platform/auth.TokenIssuer's method of the same name structurally.
	IssueImpersonationAccessToken(actorID, userID, tenantID, sessionID uuid.UUID, roles []string, now time.Time) (string, time.Time, error)
}

// IPRateLimiter matches platform/auth.IPRateLimiter's Allow signature
// structurally.
type IPRateLimiter interface {
	Allow(ctx context.Context, ip string) (bool, error)
}

type Config struct {
	RefreshTokenTTL time.Duration
	// WebBaseURL prefixes the link sent in a password reset email, e.g.
	// "https://smansa.sch.id" -> ".../reset-password?token=...".
	WebBaseURL string
	// AvatarMaxBytes caps an uploaded avatar's size (docs/08-security.md
	// section 6: 2 MB for avatars).
	AvatarMaxBytes int64
	// PasskeyRPID is the WebAuthn Relying Party ID: the effective domain a
	// registered credential is bound to (e.g. "smansa.sch.id" or, in
	// multi-tenant mode, the shared base domain so a credential registered
	// on one tenant subdomain still verifies there). It is never taken
	// from a request; the client-supplied origin is only ever checked
	// against PasskeyRPOrigins, never used to set this.
	PasskeyRPID string
	// PasskeyRPOrigins are the exact origins (scheme + host [+ port]) a
	// WebAuthn ceremony is allowed to have happened on.
	PasskeyRPOrigins []string
	// PasskeyRPDisplayName is shown by the browser's passkey UI.
	PasskeyRPDisplayName string
}

// Extras groups the dependencies added by the admin features around the
// original Phase 0 constructor args, so New's signature does not keep
// growing one positional parameter at a time.
type Extras struct {
	ResetLimiter IPRateLimiter
	Email        notify.EmailSender
	Storage      *storage.Client // nil when S3 is not configured; avatar upload then returns ErrUploadNotConfigured
	// MfaRepo and MfaSealer enable TOTP two-factor. Both nil means the
	// feature is off and every MFA call returns ErrMfaNotAvailable.
	MfaRepo   MfaRepository
	MfaSealer Sealer
	// SSOSealer encrypts a tenant's Google client secret at rest. nil
	// means Google SSO administration is off (ErrSSONotConfigured). In
	// practice this is the same *crypto.Sealer instance as MfaSealer --
	// one platform key seals every secret identity stores -- but the
	// field is kept separate so a deployment could rotate them on
	// different schedules.
	SSOSealer Sealer
	// GoogleVerifier checks a Google ID token's signature and claims. nil
	// disables the Google SSO login endpoint even if a tenant has
	// configured a client id.
	GoogleVerifier GoogleIDTokenVerifier
	// Ceremony stores the in-progress state of a WebAuthn registration or
	// login between its Begin and Finish calls. nil disables passkeys
	// entirely.
	Ceremony CeremonyStore
	// SessionCache lets the service evict a just-revoked session from the
	// middleware's validity cache. nil (e.g. in a unit test) just skips
	// the eviction -- the cache entry still expires on its own TTL.
	SessionCache SessionInvalidator
	// PushDevices lets the service delete a user's push devices on
	// logout/revoke-all. nil (e.g. a deployment without the notifications
	// module wired, or a unit test) just skips the deletion.
	PushDevices PushDeviceRevoker
}

// SessionInvalidator evicts a session from the authn middleware's
// short-lived validity cache. Matches platform/auth.SessionCache's
// Invalidate method structurally. A revocation the service makes on a
// session other than "the current request's own" (password change,
// password-reset confirm, refresh-reuse family revocation) must call this
// itself -- there is no HTTP handler downstream of those to do it, unlike
// logout or "revoke this session" (docs/analysis/backend-inventory.md
// section 1.1).
type SessionInvalidator interface {
	Invalidate(ctx context.Context, tenantID, sessionID uuid.UUID) error
}

// PushDeviceRevoker deletes a user's registered push devices, implemented
// by the notifications module. Called on logout and on every "revoke all
// other sessions" flow (password change, password-reset confirm,
// single-device login) so a device that no longer has a valid session
// also stops receiving push (docs/analysis/backend-inventory.md section
// 1.1 and 1.8).
type PushDeviceRevoker interface {
	RemoveAllPushDevicesForUser(ctx context.Context, tenantID, userID uuid.UUID) error
}

// CeremonyStore is the narrow key-value contract passkey ceremonies need
// to bridge a Begin call and its matching Finish call. It is satisfied
// structurally by *platform/auth.RedisStore and *platform/auth.MemoryStore.
type CeremonyStore interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key, value string, ttl time.Duration) error
	Del(ctx context.Context, key string) error
}

type Service struct {
	pool           *pgxpool.Pool
	repo           Repository
	years          AcademicYearReader
	limiter        RateLimiter
	tokens         TokenIssuer
	clock          clock.Clock
	cfg            Config
	newRefresh     func() (token string, hash []byte, err error)
	extras         Extras
	mfaRepo        MfaRepository
	mfaSealer      Sealer
	googleVerifier GoogleIDTokenVerifier
	ceremony       CeremonyStore
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, limiter RateLimiter, tokens TokenIssuer, clk clock.Clock, cfg Config, newRefresh func() (string, []byte, error), extras Extras) *Service {
	return &Service{
		pool: pool, repo: repo, years: years, limiter: limiter, tokens: tokens, clock: clk, cfg: cfg, newRefresh: newRefresh,
		extras: extras, mfaRepo: extras.MfaRepo, mfaSealer: extras.MfaSealer,
		googleVerifier: extras.GoogleVerifier, ceremony: extras.Ceremony,
	}
}

// withTx opens the tenant-scoped transaction for one use case, per
// docs/03-layered-architecture.md section 2: the service is what calls
// database.WithTenantTx, not the transport handler, so app.tenant_id is
// never set (or forgotten) anywhere else.
func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// EffectivePermissions implements authz.PermissionsProvider: role
// permissions union active duty permissions, per
// docs/06-database-schema.md section 3.
func (s *Service) EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error) {
	var principal authz.Principal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		principal, err = s.loadPrincipal(ctx, tenantID, userID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return principal.Effective(), nil
}

// IsSessionActive implements auth.SessionLookup for the authn middleware.
func (s *Service) IsSessionActive(ctx context.Context, tenantID, sessionID uuid.UUID) (bool, error) {
	return s.repo.IsSessionActive(ctx, tenantID, sessionID)
}

// TouchSessionLastSeen implements auth.SessionLookup for the authn
// middleware, which throttles how often it calls this.
func (s *Service) TouchSessionLastSeen(ctx context.Context, tenantID, sessionID uuid.UUID) error {
	return s.repo.TouchSessionLastSeen(ctx, tenantID, sessionID)
}

// invalidateSessions evicts every id in ids from the middleware's
// validity cache. Best-effort: a failure here just means the affected
// sessions stay accepted for up to the cache's TTL instead of being
// rejected immediately, not a correctness break (the database row is
// already revoked).
func (s *Service) invalidateSessions(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) {
	if s.extras.SessionCache == nil {
		return
	}
	for _, id := range ids {
		_ = s.extras.SessionCache.Invalidate(ctx, tenantID, id)
	}
}

// revokePushDevices deletes every push device registered for userID.
// Best-effort, same reasoning as invalidateSessions: the sessions are
// already revoked in the database regardless of whether this succeeds.
func (s *Service) revokePushDevices(ctx context.Context, tenantID, userID uuid.UUID) {
	if s.extras.PushDevices == nil {
		return
	}
	_ = s.extras.PushDevices.RemoveAllPushDevicesForUser(ctx, tenantID, userID)
}

// PruneSessions deletes revoked/expired sessions older than 30 days for
// every active tenant. Wired as a periodic job (transport/jobs).
func (s *Service) PruneSessions(ctx context.Context) error {
	tenantIDs, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return err
	}
	for _, tenantID := range tenantIDs {
		err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
			_, err := s.repo.PruneOldSessions(ctx, tenantID)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) loadPrincipal(ctx context.Context, tenantID, userID uuid.UUID) (authz.Principal, error) {
	roles, err := s.repo.ListRolesForUser(ctx, tenantID, userID)
	if err != nil {
		return authz.Principal{}, err
	}
	roleIDs := make([]uuid.UUID, len(roles))
	for i, r := range roles {
		roleIDs[i] = r.ID
	}
	rolePerms, err := s.repo.ListPermissionCodesForRoles(ctx, roleIDs)
	if err != nil {
		return authz.Principal{}, err
	}

	principal := authz.Principal{UserID: userID, RolePerms: rolePerms}

	if yearID, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID); err == nil && ok {
		duties, err := s.repo.ListActiveDuties(ctx, tenantID, userID, yearID)
		if err == nil {
			principal.Duties = duties
		}
	}

	return principal, nil
}

// UsersWithDuty returns who currently holds the duty slug in the active
// academic year: every holder of a school-scoped duty, or the holders
// scoped to classID for a class-scoped one. The wiring layer uses it to
// address notifications without reading identity's tables directly.
func (s *Service) UsersWithDuty(ctx context.Context, tenantID uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		ids, err = s.repo.ListUserIDsWithActiveDuty(ctx, tenantID, slug, classID)
		return err
	})
	return ids, err
}
