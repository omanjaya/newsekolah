// Package repository implements identity/service.Repository using sqlc's
// generated Queries. It never contains business rules, only mapping
// between database rows and domain types.
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func (r *Repository) GetUserByUsername(ctx context.Context, tenantID uuid.UUID, username string) (domain.User, error) {
	row, err := r.queries(ctx).GetUserByUsername(ctx, db.GetUserByUsernameParams{TenantID: tenantID, Username: username})
	if err != nil {
		return domain.User{}, fmt.Errorf("get user by username: %w", err)
	}
	return toDomainUser(row), nil
}

func (r *Repository) GetUserByID(ctx context.Context, tenantID, userID uuid.UUID) (domain.User, error) {
	row, err := r.queries(ctx).GetUserByID(ctx, db.GetUserByIDParams{TenantID: tenantID, ID: userID})
	if err != nil {
		return domain.User{}, fmt.Errorf("get user by id: %w", err)
	}
	return toDomainUser(row), nil
}

func (r *Repository) UpdateUserPassword(ctx context.Context, tenantID, userID uuid.UUID, passwordHash string) error {
	return r.queries(ctx).UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		TenantID: tenantID, ID: userID, PasswordHash: passwordHash, MustChangePassword: false,
	})
}

func (r *Repository) UpdateLastLogin(ctx context.Context, tenantID, userID uuid.UUID, at time.Time) error {
	return r.queries(ctx).UpdateUserLastLogin(ctx, db.UpdateUserLastLoginParams{
		TenantID: tenantID, ID: userID, LastLoginAt: pdatabase.Timestamptz(at),
	})
}

func (r *Repository) RecordLoginAttempt(ctx context.Context, tenantID uuid.UUID, username, ip string, success bool) error {
	return r.queries(ctx).InsertLoginAttempt(ctx, db.InsertLoginAttemptParams{
		TenantID: tenantID, Username: username, Ip: pdatabase.Inet(ip), Success: success,
	})
}

func (r *Repository) ListRolesForUser(ctx context.Context, _, userID uuid.UUID) ([]domain.Role, error) {
	rows, err := r.queries(ctx).ListRolesForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list roles for user: %w", err)
	}
	roles := make([]domain.Role, len(rows))
	for i, row := range rows {
		roles[i] = domain.Role{ID: row.ID, Slug: row.Slug, Name: row.Name, IsPrimary: row.IsPrimary}
	}
	return roles, nil
}

func (r *Repository) ListPermissionCodesForRoles(ctx context.Context, roleIDs []uuid.UUID) ([]string, error) {
	if len(roleIDs) == 0 {
		return nil, nil
	}
	return r.queries(ctx).ListPermissionCodesForRoles(ctx, roleIDs)
}

func (r *Repository) ListActiveDuties(ctx context.Context, tenantID, userID, academicYearID uuid.UUID) ([]authz.Duty, error) {
	rows, err := r.queries(ctx).ListActiveDutyAssignmentsForUser(ctx, db.ListActiveDutyAssignmentsForUserParams{
		TenantID: tenantID, UserID: userID, AcademicYearID: academicYearID,
	})
	if err != nil {
		return nil, fmt.Errorf("list active duty assignments: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}

	duties := make([]authz.Duty, len(rows))
	for i, row := range rows {
		duties[i] = authz.Duty{
			Slug:           row.Slug,
			Name:           row.Name,
			ScopeKind:      authz.ScopeKind(row.ScopeKind),
			ScopeClassID:   pdatabase.UUIDOrNil(row.ScopeClassID),
			ScopeStudentID: pdatabase.UUIDOrNil(row.ScopeStudentID),
		}
	}

	permsByDutyType, err := r.permissionsByDutyType(ctx, tenantID, userID, academicYearID)
	if err != nil {
		return nil, err
	}
	for i, row := range rows {
		duties[i].Permissions = permsByDutyType[row.Slug]
	}

	return duties, nil
}

// permissionsByDutyType maps each active duty type slug (for this user and
// academic year) to the permission codes it grants.
func (r *Repository) permissionsByDutyType(ctx context.Context, tenantID, userID, academicYearID uuid.UUID) (map[string][]string, error) {
	rows, err := r.queries(ctx).ListActiveDutyAssignmentsWithPermissions(ctx, db.ListActiveDutyAssignmentsWithPermissionsParams{
		TenantID: tenantID, UserID: userID, AcademicYearID: academicYearID,
	})
	if err != nil {
		return nil, fmt.Errorf("list active duty permissions: %w", err)
	}
	out := map[string][]string{}
	for _, row := range rows {
		out[row.Slug] = append(out[row.Slug], row.PermissionCode)
	}
	return out, nil
}

func (r *Repository) CreateSession(ctx context.Context, s service.NewSession) (domain.Session, error) {
	row, err := r.queries(ctx).CreateSession(ctx, db.CreateSessionParams{
		TenantID:         s.TenantID,
		UserID:           s.UserID,
		Kind:             s.Kind,
		RefreshTokenHash: s.RefreshTokenHash,
		FamilyID:         s.FamilyID,
		Client:           string(s.Client),
		DeviceID:         pdatabase.Text(s.DeviceID),
		DeviceName:       pdatabase.Text(s.DeviceName),
		UserAgent:        pdatabase.Text(s.UserAgent),
		Ip:               pdatabase.Inet(s.IP),
		ExpiresAt:        pdatabase.Timestamptz(s.ExpiresAt),
	})
	if err != nil {
		return domain.Session{}, fmt.Errorf("create session: %w", err)
	}
	return toDomainSession(row), nil
}

func (r *Repository) GetSessionByRefreshHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.Session, error) {
	row, err := r.queries(ctx).GetSessionByRefreshHash(ctx, db.GetSessionByRefreshHashParams{TenantID: tenantID, RefreshTokenHash: hash})
	if err != nil {
		return domain.Session{}, fmt.Errorf("get session by refresh hash: %w", err)
	}
	return toDomainSession(row), nil
}

func (r *Repository) RevokeSession(ctx context.Context, tenantID, sessionID uuid.UUID, reason string) error {
	return r.queries(ctx).RevokeSession(ctx, db.RevokeSessionParams{TenantID: tenantID, ID: sessionID, RevokedReason: pdatabase.Text(reason)})
}

func (r *Repository) RevokeSessionFamily(ctx context.Context, tenantID, familyID uuid.UUID, reason string) error {
	return r.queries(ctx).RevokeSessionFamily(ctx, db.RevokeSessionFamilyParams{TenantID: tenantID, FamilyID: familyID, RevokedReason: pdatabase.Text(reason)})
}

func (r *Repository) RevokeOtherSessions(ctx context.Context, tenantID, userID, keepSessionID uuid.UUID, reason string) error {
	return r.queries(ctx).RevokeOtherUserSessions(ctx, db.RevokeOtherUserSessionsParams{
		TenantID: tenantID, UserID: userID, ID: keepSessionID, RevokedReason: pdatabase.Text(reason),
	})
}

func (r *Repository) ListActiveSessions(ctx context.Context, tenantID, userID uuid.UUID) ([]service.SessionView, error) {
	rows, err := r.queries(ctx).ListActiveSessionsForUser(ctx, db.ListActiveSessionsForUserParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("list active sessions: %w", err)
	}
	views := make([]service.SessionView, len(rows))
	for i, row := range rows {
		views[i] = service.SessionView{
			ID:         row.ID,
			Client:     row.Client,
			DeviceName: pdatabase.TextOrEmpty(row.DeviceName),
			IP:         pdatabase.InetOrEmpty(row.Ip),
			UserAgent:  pdatabase.TextOrEmpty(row.UserAgent),
			CreatedAt:  pdatabase.TimeOrZero(row.CreatedAt),
			LastSeenAt: pdatabase.TimeOrZero(row.LastSeenAt),
		}
	}
	return views, nil
}

// IsSessionActive opens its own short read-only transaction because it is
// called from the authn middleware, outside any service-level transaction.
// The active/expired comparison happens in SQL (now()), not in Go, so this
// stays clear of the forbidigo time.Now() restriction outside platform/clock.
func (r *Repository) IsSessionActive(ctx context.Context, tenantID, sessionID uuid.UUID) (bool, error) {
	var active bool
	err := pdatabase.WithTenantTx(ctx, r.pool, tenantID, func(ctx context.Context) error {
		tx, _ := pdatabase.TxFromContext(ctx)
		row, err := db.New(tx).IsSessionActive(ctx, db.IsSessionActiveParams{TenantID: tenantID, ID: sessionID})
		if err != nil {
			active = false
			return nil
		}
		active = row.Valid && row.Bool
		return nil
	})
	return active, err
}

func toDomainUser(row db.User) domain.User {
	return domain.User{
		ID:                 row.ID,
		TenantID:           row.TenantID,
		Username:           row.Username,
		Email:              pdatabase.TextOrEmpty(row.Email),
		Name:               row.Name,
		PasswordHash:       row.PasswordHash,
		Status:             domain.UserStatus(row.Status),
		MustChangePassword: row.MustChangePassword,
		Locale:             row.Locale,
	}
}

func toDomainSession(row db.Session) domain.Session {
	return domain.Session{
		ID:        row.ID,
		FamilyID:  row.FamilyID,
		UserID:    row.UserID,
		TenantID:  row.TenantID,
		Kind:      domain.SessionKind(row.Kind),
		Client:    domain.ClientKind(row.Client),
		RevokedAt: pdatabase.TimePtr(row.RevokedAt),
		ExpiresAt: pdatabase.TimeOrZero(row.ExpiresAt),
	}
}
