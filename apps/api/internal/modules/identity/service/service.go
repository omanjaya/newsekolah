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
	ImpersonationRepository
	PasswordResetRepository
	ProfileRepository
	AuditRepository
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

	CreateSession(ctx context.Context, s NewSession) (domain.Session, error)
	GetSessionByRefreshHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.Session, error)
	RevokeSession(ctx context.Context, tenantID, sessionID uuid.UUID, reason string) error
	RevokeSessionFamily(ctx context.Context, tenantID, familyID uuid.UUID, reason string) error
	RevokeOtherSessions(ctx context.Context, tenantID, userID, keepSessionID uuid.UUID, reason string) error
	ListActiveSessions(ctx context.Context, tenantID, userID uuid.UUID) ([]SessionView, error)
	IsSessionActive(ctx context.Context, tenantID, sessionID uuid.UUID) (bool, error)
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
}

// Extras groups the dependencies added by the admin features around the
// original Phase 0 constructor args, so New's signature does not keep
// growing one positional parameter at a time.
type Extras struct {
	ResetLimiter IPRateLimiter
	Email        notify.EmailSender
	Storage      *storage.Client // nil when S3 is not configured; avatar upload then returns ErrUploadNotConfigured
}

type Service struct {
	pool       *pgxpool.Pool
	repo       Repository
	years      AcademicYearReader
	limiter    RateLimiter
	tokens     TokenIssuer
	clock      clock.Clock
	cfg        Config
	newRefresh func() (token string, hash []byte, err error)
	extras     Extras
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, limiter RateLimiter, tokens TokenIssuer, clk clock.Clock, cfg Config, newRefresh func() (string, []byte, error), extras Extras) *Service {
	return &Service{pool: pool, repo: repo, years: years, limiter: limiter, tokens: tokens, clock: clk, cfg: cfg, newRefresh: newRefresh, extras: extras}
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
