package service

import (
	"context"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
)

type LoginInput struct {
	TenantID   uuid.UUID
	Username   string
	Password   string
	Client     domain.ClientKind
	DeviceID   string
	DeviceName string
	IP         string
	UserAgent  string
	// OTP carries the TOTP or recovery code when the account has a second
	// factor; an empty value on an enrolled account returns ErrMfaRequired.
	OTP string
}

type AuthResult struct {
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
	SessionID        uuid.UUID
	Me               MeResult
}

// Login verifies credentials, enforces the login rate limit, and opens a
// new session. Unknown usernames still run a full Argon2id verification
// against a dummy hash so the response time does not disclose whether the
// account exists (docs/08-security.md section 2). The rate limiter check
// itself happens before the transaction: it is Redis/in-memory state, not
// tenant-scoped Postgres data.
func (s *Service) Login(ctx context.Context, in LoginInput) (AuthResult, error) {
	in.Username = domain.NormalizeUsername(in.Username)
	allowed, err := s.limiter.Allow(ctx, in.TenantID.String(), in.Username, in.IP)
	if err != nil {
		return AuthResult{}, err
	}
	if !allowed {
		return AuthResult{}, domain.ErrRateLimited
	}

	var result AuthResult
	err = s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		var err error
		result, err = s.login(ctx, in)
		return err
	})
	return result, err
}

func (s *Service) login(ctx context.Context, in LoginInput) (AuthResult, error) {
	user, err := s.repo.GetUserByUsername(ctx, in.TenantID, in.Username)
	if err != nil {
		auth.VerifyAgainstDummy(in.Password)
		s.recordLoginAttemptDurably(ctx, in.TenantID, in.Username, in.IP, false)
		return AuthResult{}, domain.ErrInvalidCredentials
	}

	if verifyErr := auth.VerifyPassword(user.PasswordHash, in.Password); verifyErr != nil {
		s.recordLoginAttemptDurably(ctx, in.TenantID, in.Username, in.IP, false)
		return AuthResult{}, domain.ErrInvalidCredentials
	}

	if !user.CanAuthenticate() {
		s.recordLoginAttemptDurably(ctx, in.TenantID, in.Username, in.IP, false)
		return AuthResult{}, domain.ErrAccountNotActive
	}

	requiresMFA, err := s.RequiresTOTP(ctx, in.TenantID, user.ID)
	if err != nil {
		return AuthResult{}, err
	}
	if requiresMFA {
		if in.OTP == "" {
			return AuthResult{}, domain.ErrMfaRequired
		}
		if err := s.verifyTOTPInTx(ctx, in.TenantID, user.ID, in.OTP); err != nil {
			s.recordLoginAttemptDurably(ctx, in.TenantID, in.Username, in.IP, false)
			return AuthResult{}, err
		}
	}

	_ = s.repo.RecordLoginAttempt(ctx, in.TenantID, in.Username, in.IP, true)
	now := s.clock.Now()
	_ = s.repo.UpdateLastLogin(ctx, in.TenantID, user.ID, now)

	authSettings, err := s.repo.GetAuthSettings(ctx, in.TenantID)
	if err != nil {
		return AuthResult{}, err
	}
	if authSettings.SingleDevice {
		// uuid.Nil never matches a real session id: every existing session
		// of this user is revoked, since the one being opened here does
		// not exist yet to exempt (docs/analysis/backend-inventory.md
		// section 1.8).
		revokedIDs, err := s.repo.RevokeOtherSessions(ctx, in.TenantID, user.ID, uuid.Nil, "single_device_login")
		if err != nil {
			return AuthResult{}, err
		}
		s.invalidateSessions(ctx, revokedIDs)
		s.revokePushDevices(ctx, in.TenantID, user.ID)
	}

	ttl := time.Duration(authSettings.SessionDays) * 24 * time.Hour
	session, refreshToken, err := s.openSessionWithTTL(ctx, user, uuid.New(), in.Client, in.DeviceID, in.DeviceName, in.UserAgent, in.IP, now, ttl)
	if err != nil {
		return AuthResult{}, err
	}

	return s.buildAuthResult(ctx, user, session, refreshToken, now)
}

// Refresh rotates a refresh token. Reuse of an already-rotated token
// revokes the whole session family (docs/08-security.md section 2). The
// new session keeps the client kind of the session being rotated -- the
// caller does not get to change it mid-rotation.
func (s *Service) Refresh(ctx context.Context, tenantID uuid.UUID, refreshToken string, ip, userAgent string) (AuthResult, error) {
	var result AuthResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		result, err = s.refresh(ctx, tenantID, refreshToken, ip, userAgent)
		return err
	})
	return result, err
}

func (s *Service) refresh(ctx context.Context, tenantID uuid.UUID, refreshToken string, ip, userAgent string) (AuthResult, error) {
	now := s.clock.Now()
	hash := auth.HashRefreshToken(refreshToken)

	session, err := s.repo.GetSessionByRefreshHash(ctx, tenantID, hash)
	if err != nil {
		return AuthResult{}, domain.ErrSessionNotFound
	}
	if !session.Kind.CanRefresh() {
		return AuthResult{}, domain.ErrSessionExpired
	}

	switch domain.EvaluateRefresh(session, now) {
	case domain.RefreshReuseDetected:
		// This branch always returns an error, which makes the enclosing
		// transaction (opened by Refresh) roll back -- but the family
		// revocation is the one thing here that must survive regardless.
		// It runs in its own, independent transaction (a separate pooled
		// connection) so it commits even though the outer one will not.
		familyID := session.FamilyID
		var revokedIDs []uuid.UUID
		_ = s.withTx(database.Detach(ctx), tenantID, func(ctx context.Context) error {
			var err error
			revokedIDs, err = s.repo.RevokeSessionFamily(ctx, tenantID, familyID, "reuse_detected")
			return err
		})
		s.invalidateSessions(ctx, revokedIDs)
		return AuthResult{}, domain.ErrRefreshReuseDetected
	case domain.RefreshExpired:
		return AuthResult{}, domain.ErrSessionExpired
	}

	user, err := s.repo.GetUserByID(ctx, tenantID, session.UserID)
	if err != nil {
		return AuthResult{}, domain.ErrUserNotFound
	}
	if !user.CanAuthenticate() {
		return AuthResult{}, domain.ErrAccountNotActive
	}

	if err := s.repo.RevokeSession(ctx, tenantID, session.ID, "rotated"); err != nil {
		return AuthResult{}, err
	}

	ttl, err := s.sessionTTL(ctx, tenantID)
	if err != nil {
		return AuthResult{}, err
	}
	newSession, refreshTokenPlain, err := s.openSessionWithTTL(ctx, user, session.FamilyID, session.Client, "", "", userAgent, ip, now, ttl)
	if err != nil {
		return AuthResult{}, err
	}

	return s.buildAuthResult(ctx, user, newSession, refreshTokenPlain, now)
}

// recordLoginAttemptDurably writes a failed login_attempts row in its own,
// independent transaction. It is only used on the failure paths of login,
// which return a domain error that makes the enclosing transaction roll
// back; without this, the audit trail of failed attempts would vanish
// along with everything else in that transaction.
func (s *Service) recordLoginAttemptDurably(ctx context.Context, tenantID uuid.UUID, username, ip string, success bool) {
	_ = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.RecordLoginAttempt(ctx, tenantID, username, ip, success)
	})
}

// openSessionWithTTL opens a session with an explicit refresh-token
// lifetime -- every caller (login, refresh, passkey login, Google SSO)
// passes the tenant's own auth.session_days (see sessionTTL), not the
// deployment-wide REFRESH_TOKEN_TTL default.
func (s *Service) openSessionWithTTL(ctx context.Context, user domain.User, familyID uuid.UUID, client domain.ClientKind, deviceID, deviceName, userAgent, ip string, now time.Time, ttl time.Duration) (domain.Session, string, error) {
	refreshToken, hash, err := s.newRefresh()
	if err != nil {
		return domain.Session{}, "", err
	}

	created, err := s.repo.CreateSession(ctx, NewSession{
		TenantID:         user.TenantID,
		UserID:           user.ID,
		Kind:             "login",
		FamilyID:         familyID,
		RefreshTokenHash: hash,
		Client:           client,
		DeviceID:         deviceID,
		DeviceName:       deviceName,
		UserAgent:        userAgent,
		IP:               ip,
		ExpiresAt:        now.Add(ttl),
	})
	if err != nil {
		return domain.Session{}, "", err
	}
	return created, refreshToken, nil
}

func (s *Service) buildAuthResult(ctx context.Context, user domain.User, session domain.Session, refreshToken string, now time.Time) (AuthResult, error) {
	me, err := s.me(ctx, user)
	if err != nil {
		return AuthResult{}, err
	}

	roleSlugs := make([]string, len(me.Roles))
	for i, r := range me.Roles {
		roleSlugs[i] = r.Slug
	}

	accessToken, accessExpiresAt, err := s.tokens.IssueAccessToken(user.ID, user.TenantID, session.ID, roleSlugs, now)
	if err != nil {
		return AuthResult{}, err
	}

	return AuthResult{
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiresAt,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: session.ExpiresAt,
		SessionID:        session.ID,
		Me:               me,
	}, nil
}

// Logout revokes exactly the current session, and also deletes every push
// device registered for the user: the schema has no session-to-device
// link, so "the device this session logged out from" and "all of this
// user's devices" cannot be told apart -- matching the old app's own
// behavior of clearing every subscription on logout
// (reference/sion-rebuild-go main.go).
func (s *Service) Logout(ctx context.Context, tenantID, userID, sessionID uuid.UUID) error {
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.RevokeSession(ctx, tenantID, sessionID, "logout")
	})
	if err != nil {
		return err
	}
	s.revokePushDevices(ctx, tenantID, userID)
	return nil
}

func (s *Service) ListSessions(ctx context.Context, tenantID, userID uuid.UUID) ([]SessionView, error) {
	var views []SessionView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		views, err = s.repo.ListActiveSessions(ctx, tenantID, userID)
		return err
	})
	return views, err
}

// RevokeSession revokes one of the caller's own sessions; it never allows
// revoking another user's session (object-level check, not just a
// permission check, per docs/08-security.md section 3).
func (s *Service) RevokeSession(ctx context.Context, tenantID, userID, sessionID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		sessions, err := s.repo.ListActiveSessions(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		owned := false
		for _, sess := range sessions {
			if sess.ID == sessionID {
				owned = true
				break
			}
		}
		if !owned {
			return domain.ErrSessionNotFound
		}
		return s.repo.RevokeSession(ctx, tenantID, sessionID, "revoked_by_user")
	})
}

// ChangePassword verifies the current password, stores the new one, and
// revokes every other session for the user (docs/08-security.md section 2).
func (s *Service) ChangePassword(ctx context.Context, tenantID, userID, currentSessionID uuid.UUID, currentPassword, newPassword string) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		user, err := s.repo.GetUserByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		if err := auth.VerifyPassword(user.PasswordHash, currentPassword); err != nil {
			return domain.ErrInvalidCredentials
		}
		if err := domain.ValidatePasswordPolicy(newPassword); err != nil {
			return err
		}

		hash, err := auth.HashPassword(newPassword)
		if err != nil {
			return err
		}
		if err := s.repo.UpdateUserPassword(ctx, tenantID, userID, hash); err != nil {
			return err
		}

		revokedIDs, err := s.repo.RevokeOtherSessions(ctx, tenantID, userID, currentSessionID, "password_changed")
		if err != nil {
			return err
		}
		s.invalidateSessions(ctx, revokedIDs)
		s.revokePushDevices(ctx, tenantID, userID)
		return nil
	})
}
