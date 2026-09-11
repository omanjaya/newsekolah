package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// NewImpersonationSession is what CreateImpersonationSessionRecord
// persists to sessions (kind='impersonation').
type NewImpersonationSession struct {
	TenantID         uuid.UUID
	UserID           uuid.UUID
	ActorUserID      uuid.UUID
	RefreshTokenHash []byte
	FamilyID         uuid.UUID
	Client           domain.ClientKind
	IP               string
	UserAgent        string
	ExpiresAt        time.Time
}

// ImpersonationRepository is the data-access boundary for starting an
// impersonation session and recording what happens during one
// (docs/08-security.md section 2).
type ImpersonationRepository interface {
	CreateImpersonationSessionRecord(ctx context.Context, in NewImpersonationSession) (domain.Session, error)
	GetSessionByID(ctx context.Context, tenantID, sessionID uuid.UUID) (domain.Session, error)
	InsertImpersonationActionRecord(ctx context.Context, tenantID, sessionID uuid.UUID, method, path, ip string) error
}

// StartImpersonation opens a 30-minute impersonation session as targetID,
// acting for actorID. The resulting access token's subject is targetID
// (so authz and object-scope checks behave exactly as if targetID were
// logged in) but carries actorID in its `act` claim, and every request
// made with it is logged to impersonation_actions by
// RecordImpersonationAction.
func (s *Service) StartImpersonation(ctx context.Context, tenantID, actorID, targetID uuid.UUID, client domain.ClientKind, ip, userAgent string) (AuthResult, error) {
	var result AuthResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		targetRow, err := s.repo.GetUserAdminByID(ctx, tenantID, targetID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		targetIsSuper, err := s.isSuperAdmin(ctx, targetID)
		if err != nil {
			return err
		}
		if err := domain.ValidateImpersonationTarget(actorID, domain.ImpersonationTarget{
			ID: targetID, Status: targetRow.Status, IsSuperAdmin: targetIsSuper,
		}); err != nil {
			return err
		}

		targetUser, err := s.repo.GetUserByID(ctx, tenantID, targetID)
		if err != nil {
			return domain.ErrUserNotFound
		}

		now := s.clock.Now()
		refreshToken, hash, err := s.newRefresh()
		if err != nil {
			return err
		}
		session, err := s.repo.CreateImpersonationSessionRecord(ctx, NewImpersonationSession{
			TenantID: tenantID, UserID: targetID, ActorUserID: actorID, RefreshTokenHash: hash,
			FamilyID: uuid.New(), Client: client, IP: ip, UserAgent: userAgent,
			ExpiresAt: now.Add(impersonationSessionTTL),
		})
		if err != nil {
			return fmt.Errorf("create impersonation session: %w", err)
		}

		me, err := s.me(ctx, targetUser)
		if err != nil {
			return err
		}
		actorUser, err := s.repo.GetUserByID(ctx, tenantID, actorID)
		if err == nil {
			me.ImpersonatedBy = &ImpersonatorView{UserID: actorUser.ID, Name: actorUser.Name}
		}

		roleSlugs := make([]string, len(me.Roles))
		for i, r := range me.Roles {
			roleSlugs[i] = r.Slug
		}
		accessToken, accessExpiresAt, err := s.tokens.IssueImpersonationAccessToken(actorID, targetID, tenantID, session.ID, roleSlugs, now)
		if err != nil {
			return err
		}

		result = AuthResult{
			AccessToken: accessToken, AccessExpiresAt: accessExpiresAt,
			RefreshToken: refreshToken, RefreshExpiresAt: session.ExpiresAt,
			SessionID: session.ID, Me: me,
		}
		return audit.Record(ctx, tenantID, "impersonation.start", "user", targetID, nil, map[string]any{"actor_user_id": actorID})
	})
	return result, err
}

// StopImpersonation revokes the current session immediately if (and only
// if) it is an impersonation session, and always returns
// domain.ErrNotImpersonating for a normal login session, closing off any
// use of this endpoint as a generic "log me out" shortcut.
func (s *Service) StopImpersonation(ctx context.Context, tenantID, sessionID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		session, err := s.repo.GetSessionByID(ctx, tenantID, sessionID)
		if err != nil {
			return domain.ErrSessionNotFound
		}
		if session.Kind != domain.SessionImpersonation {
			return domain.ErrNotImpersonating
		}
		if err := s.repo.RevokeSession(ctx, tenantID, sessionID, "impersonation_stopped"); err != nil {
			return fmt.Errorf("revoke impersonation session: %w", err)
		}
		return audit.Record(ctx, tenantID, "impersonation.stop", "user", session.UserID, nil, nil)
	})
}

// RecordImpersonationAction logs one request made under an impersonation
// session to impersonation_actions. It is best-effort by design (called
// from a middleware hook, in its own goroutine and its own detached
// context, after the response has already been written), so a logging
// failure never fails the request it is describing and never adds latency
// to it either (docs/analysis/backend-inventory.md section 1.2).
func (s *Service) RecordImpersonationAction(ctx context.Context, tenantID, sessionID uuid.UUID, method, path, ip string) {
	_ = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.InsertImpersonationActionRecord(ctx, tenantID, sessionID, method, path, ip)
	})
}
