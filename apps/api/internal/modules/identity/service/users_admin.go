package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// UserAdminRow is what the repository returns for one users row joined
// with its profile kind; the service fills in role-specific profile fields
// and roles separately (ListUsersAdmin already joins user_profiles for
// filtering, but the kind-specific tables are only fetched for GetUser,
// not for every row of a list, to keep the list query to one round trip).
type UserAdminRow struct {
	ID                 uuid.UUID
	Username           string
	Email              string
	Phone              string
	Name               string
	Status             domain.UserStatus
	ProfileKind        domain.ProfileKind
	Locale             string
	MustChangePassword bool
	LastLoginAt        time.Time
	CreatedAt          time.Time
	AvatarAssetID      uuid.NullUUID
}

// UsersAdminRepository is the data-access boundary for user administration:
// listing/searching, creating, updating, archiving, and the profile tables
// split by kind (docs/06-database-schema.md section 3).
type UsersAdminRepository interface {
	UsernameExists(ctx context.Context, tenantID uuid.UUID, username string) (bool, error)
	EmailExists(ctx context.Context, tenantID uuid.UUID, email string) (bool, error)

	ListUsersAdmin(ctx context.Context, tenantID uuid.UUID, f ListUsersFilter) ([]UserAdminRow, error)
	GetUserAdminByID(ctx context.Context, tenantID, userID uuid.UUID) (UserAdminRow, error)
	GetStudentProfile(ctx context.Context, tenantID, userID uuid.UUID) (UserProfileFields, bool, error)
	GetTeacherProfile(ctx context.Context, tenantID, userID uuid.UUID) (UserProfileFields, bool, error)
	GetStaffProfile(ctx context.Context, tenantID, userID uuid.UUID) (UserProfileFields, bool, error)

	CreateUserRecord(ctx context.Context, in NewUserRecord) (domain.User, error)
	UpsertUserProfile(ctx context.Context, tenantID, userID uuid.UUID, kind domain.ProfileKind, f UserProfileFields) error
	UpsertStudentProfile(ctx context.Context, tenantID, userID uuid.UUID, f UserProfileFields) error
	UpsertTeacherProfile(ctx context.Context, tenantID, userID uuid.UUID, f UserProfileFields) error
	UpsertStaffProfile(ctx context.Context, tenantID, userID uuid.UUID, f UserProfileFields) error

	UpdateUserBasic(ctx context.Context, tenantID, userID uuid.UUID, name, email, phone, locale string) error
	ArchiveUserRecord(ctx context.Context, tenantID, userID uuid.UUID) error
	RestoreUserRecord(ctx context.Context, tenantID, userID uuid.UUID) error

	DeleteUserRoles(ctx context.Context, tenantID, userID uuid.UUID) error
	AssignUserRoleRecord(ctx context.Context, tenantID, userID, roleID uuid.UUID, isPrimary bool) error
	ListUserRoleSlugs(ctx context.Context, userID uuid.UUID) ([]string, error)

	SetUserAvatarAsset(ctx context.Context, tenantID, userID uuid.UUID, assetID uuid.NullUUID) error

	CreatePasswordResetRecord(ctx context.Context, in NewPasswordReset) error
}

// NewUserRecord is what CreateUserRecord persists to the users table.
type NewUserRecord struct {
	TenantID           uuid.UUID
	Username           string
	Email              string
	Phone              string
	PasswordHash       string
	Name               string
	Locale             string
	MustChangePassword bool
}

// NewPasswordReset is what CreatePasswordResetRecord persists to
// password_resets.
type NewPasswordReset struct {
	TenantID  uuid.UUID
	UserID    uuid.UUID
	TokenHash []byte
	Channel   string
	ExpiresAt time.Time
}

// ListUsers returns one page of the admin user list, filtered and searched
// per docs/analysis/backend-inventory.md section 1.5.
func (s *Service) ListUsers(ctx context.Context, tenantID uuid.UUID, f ListUsersFilter) (ListUsersResult, error) {
	f.Limit = clampLimit(f.Limit)

	var result ListUsersResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		rows, err := s.repo.ListUsersAdmin(ctx, tenantID, f)
		if err != nil {
			return fmt.Errorf("list users: %w", err)
		}

		items := make([]UserAdminView, len(rows))
		for i, row := range rows {
			view, err := s.toUserAdminView(ctx, tenantID, row)
			if err != nil {
				return err
			}
			items[i] = view
		}
		result.Items = items
		if len(rows) == f.Limit {
			result.NextCursor = rows[len(rows)-1].ID
		}
		return nil
	})
	return result, err
}

// GetUser returns one user's full admin detail, including the profile
// fields specific to their profile kind.
func (s *Service) GetUser(ctx context.Context, tenantID, userID uuid.UUID) (UserAdminView, error) {
	var view UserAdminView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		row, err := s.repo.GetUserAdminByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		view, err = s.toUserAdminView(ctx, tenantID, row)
		return err
	})
	return view, err
}

func (s *Service) toUserAdminView(ctx context.Context, tenantID uuid.UUID, row UserAdminRow) (UserAdminView, error) {
	roles, err := s.repo.ListRolesForUser(ctx, tenantID, row.ID)
	if err != nil {
		return UserAdminView{}, fmt.Errorf("list roles for user %s: %w", row.ID, err)
	}

	view := UserAdminView{
		ID: row.ID, Username: row.Username, Email: row.Email, Phone: row.Phone, Name: row.Name,
		Status: row.Status, ProfileKind: row.ProfileKind, Locale: row.Locale,
		MustChangePassword: row.MustChangePassword, LastLoginAt: row.LastLoginAt, CreatedAt: row.CreatedAt,
		Roles: roles,
	}

	profile, found, err := s.loadProfileFields(ctx, tenantID, row.ID, row.ProfileKind)
	if err != nil {
		return UserAdminView{}, err
	}
	if found {
		view.Profile = profile
	}
	return view, nil
}

// loadProfileFields merges the shared user_profiles row (nik, gender,
// birth_date, ...) with whichever kind-specific table applies, into the
// one UserProfileFields shape both the admin user-detail view and GET
// /v1/me's own detail record return.
func (s *Service) loadProfileFields(ctx context.Context, tenantID, userID uuid.UUID, kind domain.ProfileKind) (UserProfileFields, bool, error) {
	shared, sharedFound, err := s.repo.GetUserProfile(ctx, tenantID, userID)
	if err != nil {
		return UserProfileFields{}, false, err
	}

	var (
		specific UserProfileFields
		found    bool
	)
	switch kind {
	case domain.ProfileStudent:
		specific, found, err = s.repo.GetStudentProfile(ctx, tenantID, userID)
	case domain.ProfileTeacher:
		specific, found, err = s.repo.GetTeacherProfile(ctx, tenantID, userID)
	case domain.ProfileStaff:
		specific, found, err = s.repo.GetStaffProfile(ctx, tenantID, userID)
	}
	if err != nil {
		return UserProfileFields{}, false, err
	}
	if !sharedFound && !found {
		return UserProfileFields{}, false, nil
	}

	merged := shared
	merged.NIS, merged.NISN, merged.EntryYear = specific.NIS, specific.NISN, specific.EntryYear
	merged.PreviousSchool, merged.FatherName, merged.MotherName = specific.PreviousSchool, specific.FatherName, specific.MotherName
	merged.GuardianName, merged.GuardianPhone, merged.ParentOccupation = specific.GuardianName, specific.GuardianPhone, specific.ParentOccupation
	merged.NIP, merged.NUPTK, merged.EmploymentStatus = specific.NIP, specific.NUPTK, specific.EmploymentStatus
	merged.LastEducation, merged.JoinedYear, merged.Specialization = specific.LastEducation, specific.JoinedYear, specific.Specialization
	merged.EmployeeNumber, merged.Position = specific.EmployeeNumber, specific.Position
	return merged, true, nil
}

// isSuperAdmin reports whether userID currently holds the super_admin role,
// used both to gate granting that role to someone else and to protect a
// super_admin from being impersonated.
func (s *Service) isSuperAdmin(ctx context.Context, userID uuid.UUID) (bool, error) {
	slugs, err := s.repo.ListUserRoleSlugs(ctx, userID)
	if err != nil {
		return false, fmt.Errorf("list role slugs for %s: %w", userID, err)
	}
	for _, slug := range slugs {
		if slug == domain.SuperAdminRoleSlug {
			return true, nil
		}
	}
	return false, nil
}

// auditUser is the before/after snapshot audit.Record stores for user
// mutations: small and stable, not the full row (avoids leaking the
// password hash into the audit trail).
type auditUser struct {
	Username    string   `json:"username"`
	Name        string   `json:"name"`
	Email       string   `json:"email,omitempty"`
	Status      string   `json:"status"`
	ProfileKind string   `json:"profile_kind,omitempty"`
	Roles       []string `json:"roles"`
}

func toAuditUser(view UserAdminView) auditUser {
	roleSlugs := make([]string, len(view.Roles))
	for i, r := range view.Roles {
		roleSlugs[i] = r.Slug
	}
	return auditUser{
		Username: view.Username, Name: view.Name, Email: view.Email,
		Status: string(view.Status), ProfileKind: string(view.ProfileKind), Roles: roleSlugs,
	}
}

func recordUserAudit(ctx context.Context, tenantID, userID uuid.UUID, action string, before, after *auditUser) error {
	return audit.Record(ctx, tenantID, action, "user", userID, before, after)
}
