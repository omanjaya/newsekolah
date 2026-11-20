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
		targetUser, err := s.impersonationTarget(ctx, tenantID, actorID, targetID)
		if err != nil {
			return err
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

// impersonationTarget is targetID when actorID may impersonate them: an
// active account other than the actor's own, and not a super admin.
func (s *Service) impersonationTarget(ctx context.Context, tenantID, actorID, targetID uuid.UUID) (domain.User, error) {
	targetRow, err := s.repo.GetUserAdminByID(ctx, tenantID, targetID)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	targetIsSuper, err := s.isSuperAdmin(ctx, targetID)
	if err != nil {
		return domain.User{}, err
	}
	if err := domain.ValidateImpersonationTarget(actorID, domain.ImpersonationTarget{
		ID: targetID, Status: targetRow.Status, IsSuperAdmin: targetIsSuper,
	}); err != nil {
		return domain.User{}, err
	}
	target, err := s.repo.GetUserByID(ctx, tenantID, targetID)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	return target, nil
}

// StartImpersonationWithReturn starts an impersonation from the admin's own
// web login and keeps a way back to it, the way StartRoleTesting does: the
// admin's login (rootSessionID, proven by rootRefresh, its refresh cookie)
// is parked in a session that lasts as long as the impersonation, sealed
// into the continuation cookie, and its old bearer revoked so no other tab
// keeps acting as the admin.
//
// StartImpersonation alone replaced the admin's refresh cookie with the
// impersonation's, which can never rotate: any page load that had to
// refresh (a reload, a typed URL, a new tab) signed the admin out, and
// stopping left no admin session in the browser either. With the
// continuation, RefreshRoleTesting renews the impersonation's access token
// up to its fixed 30-minute end, and RestoreRoleTesting (StopImpersonation)
// hands the admin their own session back.
func (s *Service) StartImpersonationWithReturn(ctx context.Context, tenantID, actorID, rootSessionID, targetID uuid.UUID, rootRefresh, ip, userAgent string) (RoleTestingStartResult, error) {
	var result RoleTestingStartResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		root, actor, err := s.continuationRoot(ctx, tenantID, actorID, rootSessionID, rootRefresh, now)
		if err != nil {
			return err
		}
		target, err := s.impersonationTarget(ctx, tenantID, actorID, targetID)
		if err != nil {
			return err
		}
		// Truncated to what timestamptz stores, so the sealed deadline and
		// the session rows agree (see StartRoleTesting).
		deadline := now.Add(impersonationSessionTTL).Truncate(time.Microsecond)
		if root.ExpiresAt.Before(deadline) {
			deadline = root.ExpiresAt
		}
		parked, parkedRefresh, err := s.openSessionWithTTL(ctx, actor, uuid.New(), domain.ClientWeb, "", "impersonation_parent", userAgent, ip, now, deadline.Sub(now))
		if err != nil {
			return err
		}
		child, err := s.newRoleTestingChild(ctx, tenantID, actorID, target, deadline, ip, userAgent)
		if err != nil {
			return err
		}
		sealed, err := s.encodeRoleTestingProof(RoleTestingProof{
			TenantID: tenantID, ActorID: actorID, ParkedSessionID: parked.ID, ParkedRefresh: parkedRefresh,
			ChildSessionID: child.SessionID, Deadline: deadline, Impersonation: true,
		})
		if err != nil {
			return err
		}
		if err := s.repo.RevokeSession(ctx, tenantID, root.ID, "impersonation_started"); err != nil {
			return err
		}
		result = RoleTestingStartResult{Auth: child, Proof: sealed, Deadline: deadline}
		return audit.Record(ctx, tenantID, "impersonation.start", "user", targetID, nil, map[string]any{"actor_user_id": actorID})
	})
	if err == nil {
		s.invalidateSessions(ctx, tenantID, []uuid.UUID{rootSessionID})
	}
	return result, err
}

// StopImpersonation revokes the current session immediately if (and only
// if) it is an impersonation session, and always returns
// domain.ErrNotImpersonating for a normal login session, closing off any
// use of this endpoint as a generic "log me out" shortcut.
func (s *Service) StopImpersonation(ctx context.Context, tenantID, sessionID uuid.UUID) error {
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
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
	if err != nil {
		return err
	}
	// Impersonation must stop effective immediately, not wait out the
	// cache TTL (docs/08-security.md section 2: "dapat dihentikan dan
	// pencabutannya efektif seketika").
	s.invalidateSessions(ctx, tenantID, []uuid.UUID{sessionID})
	return nil
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
