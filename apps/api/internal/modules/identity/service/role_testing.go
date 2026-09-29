package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

const roleTestingLifetime = 30 * time.Minute

var ErrRoleTestingUnavailable = errors.New("role testing unavailable")

// RoleTestingProof is encrypted into an HttpOnly browser cookie. The parked
// login session's refresh credential never appears in a JSON response.
type RoleTestingProof struct {
	TenantID        uuid.UUID `json:"tenant_id"`
	ActorID         uuid.UUID `json:"actor_id"`
	ParkedSessionID uuid.UUID `json:"parked_session_id"`
	ParkedRefresh   string    `json:"parked_refresh"`
	ChildSessionID  uuid.UUID `json:"child_session_id"`
	Deadline        time.Time `json:"deadline"`
	SelectedRole    string    `json:"selected_role"`
}

type RoleTestingRole struct {
	Slug string
	Name string
}

type RoleTestingUser struct {
	ID       uuid.UUID
	Username string
	Name     string
}

type RoleTestingState struct {
	Available    bool
	Active       bool
	Actor        *ImpersonatorView
	ExpiresAt    time.Time
	SelectedRole string
	Roles        []RoleTestingRole
	Users        []RoleTestingUser
	NextCursor   uuid.UUID
}

type RoleTestingStartResult struct {
	Auth     AuthResult
	Proof    string
	Deadline time.Time
}

// DecodeRoleTestingProof rejects any tampered or obsolete cookie. It does
// not itself authorize use; every operation also validates both DB sessions.
func (s *Service) DecodeRoleTestingProof(raw string) (RoleTestingProof, error) {
	if s.mfaSealer == nil || raw == "" {
		return RoleTestingProof{}, ErrRoleTestingUnavailable
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return RoleTestingProof{}, ErrRoleTestingUnavailable
	}
	plain, err := s.mfaSealer.Open(ciphertext)
	if err != nil {
		return RoleTestingProof{}, ErrRoleTestingUnavailable
	}
	var proof RoleTestingProof
	if err := json.Unmarshal(plain, &proof); err != nil || proof.TenantID == uuid.Nil || proof.ActorID == uuid.Nil || proof.ParkedSessionID == uuid.Nil || proof.ChildSessionID == uuid.Nil || proof.ParkedRefresh == "" || proof.Deadline.IsZero() {
		return RoleTestingProof{}, ErrRoleTestingUnavailable
	}
	return proof, nil
}

func (s *Service) encodeRoleTestingProof(proof RoleTestingProof) (string, error) {
	plain, err := json.Marshal(proof)
	if err != nil {
		return "", err
	}
	sealed, err := s.mfaSealer.Seal(plain)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func (s *Service) roleTestingPermission(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	roles, err := s.repo.ListRolesForUser(ctx, tenantID, userID)
	if err != nil {
		return false, err
	}
	roleIDs := make([]uuid.UUID, len(roles))
	for i, role := range roles {
		roleIDs[i] = role.ID
	}
	codes, err := s.repo.ListPermissionCodesForRoles(ctx, roleIDs)
	if err != nil {
		return false, err
	}
	for _, code := range codes {
		if code == authz.PermPlatformSuperadmin {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) validateRoleTestingProof(ctx context.Context, tenantID uuid.UUID, proof RoleTestingProof, childRefresh string) (domain.Session, domain.Session, error) {
	now := s.clock.Now()
	if proof.TenantID != tenantID || childRefresh == "" || !now.Before(proof.Deadline) {
		return domain.Session{}, domain.Session{}, ErrRoleTestingUnavailable
	}
	parked, err := s.repo.GetSessionByRefreshHash(ctx, tenantID, auth.HashRefreshToken(proof.ParkedRefresh))
	if err != nil || !validParkedRoleTestingSession(parked, proof, now) {
		return domain.Session{}, domain.Session{}, ErrRoleTestingUnavailable
	}
	child, err := s.repo.GetSessionByRefreshHash(ctx, tenantID, auth.HashRefreshToken(childRefresh))
	if err != nil || !validChildRoleTestingSession(child, proof, now) {
		return domain.Session{}, domain.Session{}, ErrRoleTestingUnavailable
	}
	childUser, err := s.repo.GetUserByID(ctx, tenantID, child.UserID)
	if err != nil || !childUser.CanAuthenticate() {
		return domain.Session{}, domain.Session{}, ErrRoleTestingUnavailable
	}
	actor, err := s.repo.GetUserByID(ctx, tenantID, proof.ActorID)
	if err != nil || !actor.CanAuthenticate() {
		return domain.Session{}, domain.Session{}, ErrRoleTestingUnavailable
	}
	allowed, err := s.roleTestingPermission(ctx, tenantID, proof.ActorID)
	if err != nil || !allowed {
		return domain.Session{}, domain.Session{}, ErrRoleTestingUnavailable
	}
	return parked, child, nil
}

func validParkedRoleTestingSession(session domain.Session, proof RoleTestingProof, now time.Time) bool {
	return session.ID == proof.ParkedSessionID && session.UserID == proof.ActorID &&
		session.Kind == domain.SessionLogin && session.RevokedAt == nil &&
		now.Before(session.ExpiresAt) && !session.ExpiresAt.Before(proof.Deadline)
}

func validChildRoleTestingSession(session domain.Session, proof RoleTestingProof, now time.Time) bool {
	return session.ID == proof.ChildSessionID && session.Kind == domain.SessionImpersonation &&
		session.ActorUserID.Valid && session.ActorUserID.UUID == proof.ActorID &&
		session.RevokedAt == nil && now.Before(session.ExpiresAt) && !session.ExpiresAt.After(proof.Deadline)
}

func (s *Service) roleTestingRoot(ctx context.Context, tenantID, actorID, sessionID uuid.UUID, refresh string, now time.Time) (domain.Session, domain.User, error) {
	if s.mfaSealer == nil || refresh == "" {
		return domain.Session{}, domain.User{}, ErrRoleTestingUnavailable
	}
	root, err := s.repo.GetSessionByRefreshHash(ctx, tenantID, auth.HashRefreshToken(refresh))
	if err != nil || root.ID != sessionID || root.UserID != actorID || root.Kind != domain.SessionLogin || root.Client != domain.ClientWeb || root.RevokedAt != nil || !now.Before(root.ExpiresAt) {
		return domain.Session{}, domain.User{}, ErrRoleTestingUnavailable
	}
	actor, err := s.repo.GetUserByID(ctx, tenantID, actorID)
	if err != nil || !actor.CanAuthenticate() {
		return domain.Session{}, domain.User{}, ErrRoleTestingUnavailable
	}
	allowed, err := s.roleTestingPermission(ctx, tenantID, actorID)
	if err != nil || !allowed {
		return domain.Session{}, domain.User{}, ErrRoleTestingUnavailable
	}
	return root, actor, nil
}

func (s *Service) roleTestingTarget(ctx context.Context, tenantID, actorID, targetID uuid.UUID, roleSlug string) (domain.User, error) {
	if roleSlug == "" || roleSlug == authz.RoleSlugSuperAdmin {
		return domain.User{}, domain.ErrRoleNotFound
	}
	if _, err := s.repo.GetRoleBySlug(ctx, tenantID, roleSlug); err != nil {
		return domain.User{}, domain.ErrRoleNotFound
	}
	target, err := s.repo.GetUserByID(ctx, tenantID, targetID)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	slugs, err := s.repo.ListUserRoleSlugs(ctx, targetID)
	if err != nil {
		return domain.User{}, err
	}
	selected := false
	isSuperAdmin := false
	for _, slug := range slugs {
		selected = selected || slug == roleSlug
		isSuperAdmin = isSuperAdmin || slug == authz.RoleSlugSuperAdmin
	}
	if !selected {
		return domain.User{}, ErrRoleTestingUnavailable
	}
	privileged, err := s.roleTestingPermission(ctx, tenantID, targetID)
	if err != nil {
		return domain.User{}, err
	}
	if err := domain.ValidateImpersonationTarget(actorID, domain.ImpersonationTarget{ID: targetID, Status: target.Status, IsSuperAdmin: privileged || isSuperAdmin}); err != nil {
		return domain.User{}, err
	}
	return target, nil
}

func (s *Service) newRoleTestingChild(ctx context.Context, tenantID, actorID uuid.UUID, target domain.User, deadline time.Time, ip, userAgent string) (AuthResult, error) {
	now := s.clock.Now()
	refresh, hash, err := s.newRefresh()
	if err != nil {
		return AuthResult{}, err
	}
	child, err := s.repo.CreateImpersonationSessionRecord(ctx, NewImpersonationSession{
		TenantID: tenantID, UserID: target.ID, ActorUserID: actorID,
		RefreshTokenHash: hash, FamilyID: uuid.New(), Client: domain.ClientWeb,
		IP: ip, UserAgent: userAgent, ExpiresAt: deadline,
	})
	if err != nil {
		return AuthResult{}, fmt.Errorf("create role testing child: %w", err)
	}
	me, err := s.me(ctx, target)
	if err != nil {
		return AuthResult{}, err
	}
	actor, err := s.repo.GetUserByID(ctx, tenantID, actorID)
	if err != nil {
		return AuthResult{}, err
	}
	me.ImpersonatedBy = &ImpersonatorView{UserID: actor.ID, Name: actor.Name}
	roles := make([]string, len(me.Roles))
	for i, role := range me.Roles {
		roles[i] = role.Slug
	}
	access, accessExpiry, err := s.tokens.IssueImpersonationAccessToken(actorID, target.ID, tenantID, child.ID, roles, now)
	if err != nil {
		return AuthResult{}, err
	}
	return AuthResult{AccessToken: access, AccessExpiresAt: accessExpiry, RefreshToken: refresh, RefreshExpiresAt: deadline, SessionID: child.ID, Me: me}, nil
}

// StartRoleTesting parks the root login in a new short-lived session and
// revokes its old bearer, so other tabs cannot keep acting as the admin.
func (s *Service) StartRoleTesting(ctx context.Context, tenantID, actorID, rootSessionID, targetID uuid.UUID, rootRefresh, roleSlug, ip, userAgent string) (RoleTestingStartResult, error) {
	var result RoleTestingStartResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		root, actor, err := s.roleTestingRoot(ctx, tenantID, actorID, rootSessionID, rootRefresh, now)
		if err != nil {
			return err
		}
		target, err := s.roleTestingTarget(ctx, tenantID, actorID, targetID, roleSlug)
		if err != nil {
			return err
		}
		// PostgreSQL timestamptz keeps microseconds. Seal the same instant
		// that session rows will store, including on nanosecond clocks.
		deadline := now.Add(roleTestingLifetime).Truncate(time.Microsecond)
		if root.ExpiresAt.Before(deadline) {
			deadline = root.ExpiresAt
		}
		parked, parkedRefresh, err := s.openSessionWithTTL(ctx, actor, uuid.New(), domain.ClientWeb, "", "role_testing_parent", userAgent, ip, now, deadline.Sub(now))
		if err != nil {
			return err
		}
		child, err := s.newRoleTestingChild(ctx, tenantID, actorID, target, deadline, ip, userAgent)
		if err != nil {
			return err
		}
		proof := RoleTestingProof{TenantID: tenantID, ActorID: actorID, ParkedSessionID: parked.ID, ParkedRefresh: parkedRefresh, ChildSessionID: child.SessionID, Deadline: deadline, SelectedRole: roleSlug}
		sealed, err := s.encodeRoleTestingProof(proof)
		if err != nil {
			return err
		}
		if err := s.repo.RevokeSession(ctx, tenantID, root.ID, "role_testing_started"); err != nil {
			return err
		}
		result = RoleTestingStartResult{Auth: child, Proof: sealed, Deadline: deadline}
		return audit.Record(audit.WithPrincipal(ctx, actorID, uuid.Nil), tenantID, "role_testing.start", "user", targetID, nil,
			map[string]any{"actor_user_id": actorID, "role": roleSlug, "deadline": deadline})
	})
	if err == nil {
		s.invalidateSessions(ctx, tenantID, []uuid.UUID{rootSessionID})
	}
	return result, err
}

// SwitchRoleTesting preserves the original deadline and parked admin
// continuation while revoking the previous test account immediately.
func (s *Service) SwitchRoleTesting(ctx context.Context, tenantID, currentChildID, targetID uuid.UUID, rawProof, childRefresh, roleSlug, ip, userAgent string) (RoleTestingStartResult, error) {
	proof, err := s.DecodeRoleTestingProof(rawProof)
	if err != nil {
		return RoleTestingStartResult{}, err
	}
	var result RoleTestingStartResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		_, current, err := s.validateRoleTestingProof(ctx, tenantID, proof, childRefresh)
		if err != nil || current.ID != currentChildID {
			return ErrRoleTestingUnavailable
		}
		target, err := s.roleTestingTarget(ctx, tenantID, proof.ActorID, targetID, roleSlug)
		if err != nil {
			return err
		}
		child, err := s.newRoleTestingChild(ctx, tenantID, proof.ActorID, target, proof.Deadline, ip, userAgent)
		if err != nil {
			return err
		}
		proof.ChildSessionID = child.SessionID
		proof.SelectedRole = roleSlug
		sealed, err := s.encodeRoleTestingProof(proof)
		if err != nil {
			return err
		}
		if err := s.repo.RevokeSession(ctx, tenantID, current.ID, "role_testing_switched"); err != nil {
			return err
		}
		result = RoleTestingStartResult{Auth: child, Proof: sealed, Deadline: proof.Deadline}
		return audit.Record(audit.WithPrincipal(ctx, proof.ActorID, current.UserID), tenantID, "role_testing.switch", "user", targetID, nil,
			map[string]any{"actor_user_id": proof.ActorID, "role": roleSlug, "previous_user_id": current.UserID})
	})
	if err == nil {
		s.invalidateSessions(ctx, tenantID, []uuid.UUID{currentChildID})
	}
	return result, err
}

// RestoreRoleTesting atomically consumes the parked admin credential and
// revokes the active test account. It works after the child access JWT has
// expired because the two HttpOnly cookies are checked against live rows.
func (s *Service) RestoreRoleTesting(ctx context.Context, tenantID uuid.UUID, rawProof, childRefresh, ip, userAgent string) (AuthResult, error) {
	proof, err := s.DecodeRoleTestingProof(rawProof)
	if err != nil {
		return AuthResult{}, err
	}
	var result AuthResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		_, child, err := s.validateRoleTestingProof(ctx, tenantID, proof, childRefresh)
		if err != nil {
			return err
		}
		result, err = s.refresh(ctx, tenantID, proof.ParkedRefresh, ip, userAgent)
		if err != nil {
			return err
		}
		if err := s.repo.RevokeSession(ctx, tenantID, child.ID, "role_testing_stopped"); err != nil {
			return err
		}
		return audit.Record(audit.WithPrincipal(ctx, proof.ActorID, child.UserID), tenantID, "role_testing.stop", "user", child.UserID, nil,
			map[string]any{"actor_user_id": proof.ActorID})
	})
	if err == nil {
		s.invalidateSessions(ctx, tenantID, []uuid.UUID{proof.ChildSessionID, proof.ParkedSessionID})
	}
	return result, err
}

// RefreshRoleTesting renews only the child access JWT. Neither the child
// refresh credential nor the fixed session deadline rotates.
func (s *Service) RefreshRoleTesting(ctx context.Context, tenantID uuid.UUID, rawProof, childRefresh string) (AuthResult, error) {
	proof, err := s.DecodeRoleTestingProof(rawProof)
	if err != nil {
		return AuthResult{}, err
	}
	var result AuthResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		_, child, err := s.validateRoleTestingProof(ctx, tenantID, proof, childRefresh)
		if err != nil {
			return err
		}
		user, err := s.repo.GetUserByID(ctx, tenantID, child.UserID)
		if err != nil || !user.CanAuthenticate() {
			return ErrRoleTestingUnavailable
		}
		me, err := s.me(ctx, user)
		if err != nil {
			return err
		}
		actor, err := s.repo.GetUserByID(ctx, tenantID, proof.ActorID)
		if err != nil {
			return err
		}
		me.ImpersonatedBy = &ImpersonatorView{UserID: actor.ID, Name: actor.Name}
		roles := make([]string, len(me.Roles))
		for i, role := range me.Roles {
			roles[i] = role.Slug
		}
		now := s.clock.Now()
		access, expires, err := s.tokens.IssueImpersonationAccessToken(proof.ActorID, user.ID, tenantID, child.ID, roles, now)
		if err != nil {
			return err
		}
		result = AuthResult{AccessToken: access, AccessExpiresAt: expires, RefreshToken: childRefresh, RefreshExpiresAt: child.ExpiresAt, SessionID: child.ID, Me: me}
		return nil
	})
	return result, err
}

// CancelRoleTesting revokes both child and parked admin on explicit logout.
func (s *Service) CancelRoleTesting(ctx context.Context, tenantID uuid.UUID, rawProof, childRefresh string) error {
	proof, err := s.DecodeRoleTestingProof(rawProof)
	if err != nil {
		return err
	}
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		parked, child, err := s.validateRoleTestingProof(ctx, tenantID, proof, childRefresh)
		if err != nil {
			return err
		}
		if err := s.repo.RevokeSession(ctx, tenantID, parked.ID, "role_testing_logout"); err != nil {
			return err
		}
		if err := s.repo.RevokeSession(ctx, tenantID, child.ID, "role_testing_logout"); err != nil {
			return err
		}
		return audit.Record(audit.WithPrincipal(ctx, proof.ActorID, child.UserID), tenantID, "role_testing.logout", "user", child.UserID, nil,
			map[string]any{"actor_user_id": proof.ActorID})
	})
	if err == nil {
		s.invalidateSessions(ctx, tenantID, []uuid.UUID{proof.ChildSessionID, proof.ParkedSessionID})
	}
	return err
}

// RoleTestingState returns a safe empty state for ordinary users and legacy
// impersonation sessions; only a live parent proof exposes the controls.
func (s *Service) RoleTestingState(ctx context.Context, tenantID, userID, sessionID uuid.UUID, actorID uuid.NullUUID, rawProof, childRefresh, roleSlug, search string, cursor uuid.UUID) (RoleTestingState, error) {
	state := RoleTestingState{Roles: []RoleTestingRole{}, Users: []RoleTestingUser{}}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		adminID, ok := s.roleTestingAdmin(ctx, tenantID, userID, sessionID, actorID, rawProof, childRefresh, &state)
		if !ok {
			return nil
		}
		allowed, err := s.roleTestingPermission(ctx, tenantID, adminID)
		if err != nil || !allowed {
			return nil
		}
		state.Available = true
		actor, err := s.repo.GetUserByID(ctx, tenantID, adminID)
		if err != nil || !actor.CanAuthenticate() {
			state.Available = false
			return nil
		}
		state.Actor = &ImpersonatorView{UserID: actor.ID, Name: actor.Name}
		roles, err := s.repo.ListRolesByTenant(ctx, tenantID)
		if err != nil {
			return err
		}
		for _, role := range roles {
			if role.Slug != authz.RoleSlugSuperAdmin {
				state.Roles = append(state.Roles, RoleTestingRole{Slug: role.Slug, Name: role.Name})
			}
		}
		if roleSlug == "" {
			return nil
		}
		return s.populateRoleTestingUsers(ctx, tenantID, adminID, roleSlug, search, cursor, &state)
	})
	return state, err
}

func (s *Service) roleTestingAdmin(ctx context.Context, tenantID, userID, sessionID uuid.UUID, actorID uuid.NullUUID, rawProof, childRefresh string, state *RoleTestingState) (uuid.UUID, bool) {
	if !actorID.Valid {
		return userID, true
	}
	proof, err := s.DecodeRoleTestingProof(rawProof)
	if err != nil {
		return uuid.Nil, false
	}
	_, child, err := s.validateRoleTestingProof(ctx, tenantID, proof, childRefresh)
	if err != nil || child.ID != sessionID || child.UserID != userID || proof.ActorID != actorID.UUID {
		return uuid.Nil, false
	}
	state.Active, state.ExpiresAt, state.SelectedRole = true, proof.Deadline, proof.SelectedRole
	return proof.ActorID, true
}

func (s *Service) populateRoleTestingUsers(ctx context.Context, tenantID, adminID uuid.UUID, roleSlug, search string, cursor uuid.UUID, state *RoleTestingState) error {
	rows, err := s.repo.ListUsersAdmin(ctx, tenantID, ListUsersFilter{Search: search, Status: "active", RoleSlug: roleSlug, Cursor: cursor, Limit: 25})
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.ID == adminID {
			continue
		}
		privileged, err := s.roleTestingPermission(ctx, tenantID, row.ID)
		if err != nil {
			return err
		}
		superRole, err := s.isSuperAdmin(ctx, row.ID)
		if err != nil {
			return err
		}
		if !privileged && !superRole {
			state.Users = append(state.Users, RoleTestingUser{ID: row.ID, Username: row.Username, Name: row.Name})
		}
	}
	if len(rows) == 25 {
		state.NextCursor = rows[len(rows)-1].ID
	}
	return nil
}
