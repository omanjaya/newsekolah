package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
)

// CreateUser creates a user, its kind-specific profile, and its role
// grants in one transaction. actorID is the admin performing the call,
// needed to enforce "only a super_admin may grant super_admin"
// (docs/analysis/backend-inventory.md section 1.2).
func (s *Service) CreateUser(ctx context.Context, tenantID, actorID uuid.UUID, in CreateUserInput) (UserAdminView, error) {
	if !in.ProfileKind.Valid() {
		return UserAdminView{}, domain.ErrInvalidProfileKind
	}
	in.Email = domain.NormalizeEmail(in.Email)

	var view UserAdminView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		grants, err := s.prepareRoleGrants(ctx, tenantID, actorID, in.Roles)
		if err != nil {
			return err
		}

		username, err := s.resolveNewUsername(ctx, tenantID, in.Username, in.Name)
		if err != nil {
			return err
		}
		if err := s.checkEmailFree(ctx, tenantID, in.Email); err != nil {
			return err
		}

		hash, err := s.hashInitialPassword(in.Password)
		if err != nil {
			return err
		}

		locale := in.Locale
		if locale == "" {
			locale = "id"
		}

		// Every freshly created account must change its password at first
		// login, whether the admin chose one or it was randomly generated
		// (the latter is never returned to anyone -- reset-password is the
		// only way to hand this user a usable credential).
		user, err := s.repo.CreateUserRecord(ctx, NewUserRecord{
			TenantID: tenantID, Username: username, Email: in.Email, Phone: in.Phone,
			PasswordHash: hash, Name: in.Name, Locale: locale, MustChangePassword: true,
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		if err := s.writeProfile(ctx, tenantID, user.ID, in.ProfileKind, in.Profile); err != nil {
			return err
		}
		if err := s.applyRoleGrants(ctx, tenantID, user.ID, grants); err != nil {
			return err
		}

		// Re-read so the response carries database-assigned fields
		// (created_at, must_change_password) exactly as stored.
		row, err := s.repo.GetUserAdminByID(ctx, tenantID, user.ID)
		if err != nil {
			return fmt.Errorf("reload created user: %w", err)
		}
		view, err = s.toUserAdminView(ctx, tenantID, row)
		if err != nil {
			return err
		}
		return recordUserAudit(ctx, tenantID, user.ID, "user.create", nil, ptrAuditUser(toAuditUser(view)))
	})
	return view, err
}

// UpdateUser updates a user's basic fields, profile, and (if Roles is
// non-nil) replaces their role grants entirely.
func (s *Service) UpdateUser(ctx context.Context, tenantID, actorID, userID uuid.UUID, in UserWriteInput) (UserAdminView, error) {
	if !in.ProfileKind.Valid() {
		return UserAdminView{}, domain.ErrInvalidProfileKind
	}
	in.Email = domain.NormalizeEmail(in.Email)

	var view UserAdminView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetUserAdminByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		beforeView, err := s.toUserAdminView(ctx, tenantID, before)
		if err != nil {
			return err
		}

		if in.Email != before.Email {
			if err := s.checkEmailFree(ctx, tenantID, in.Email); err != nil {
				return err
			}
		}

		if err := s.repo.UpdateUserBasic(ctx, tenantID, userID, in.Name, in.Email, in.Phone, in.Locale); err != nil {
			return fmt.Errorf("update user: %w", err)
		}
		if err := s.writeProfile(ctx, tenantID, userID, in.ProfileKind, in.Profile); err != nil {
			return err
		}

		if in.Roles != nil {
			grants, err := s.prepareRoleGrants(ctx, tenantID, actorID, in.Roles)
			if err != nil {
				return err
			}
			if err := s.repo.DeleteUserRoles(ctx, tenantID, userID); err != nil {
				return fmt.Errorf("clear user roles: %w", err)
			}
			if err := s.applyRoleGrants(ctx, tenantID, userID, grants); err != nil {
				return err
			}
		}

		view, err = s.toUserAdminView(ctx, tenantID, UserAdminRow{
			ID: userID, Username: before.Username, Email: in.Email, Phone: in.Phone, Name: in.Name,
			Status: before.Status, ProfileKind: in.ProfileKind, Locale: in.Locale,
			MustChangePassword: before.MustChangePassword, LastLoginAt: before.LastLoginAt, CreatedAt: before.CreatedAt,
		})
		if err != nil {
			return err
		}
		return recordUserAudit(ctx, tenantID, userID, "user.update", ptrAuditUser(toAuditUser(beforeView)), ptrAuditUser(toAuditUser(view)))
	})
	return view, err
}

// ArchiveUser soft-deletes a user (status inactive, deleted_at set). An
// admin can never archive their own account.
func (s *Service) ArchiveUser(ctx context.Context, tenantID, actorID, userID uuid.UUID) error {
	if err := domain.ValidateArchiveTarget(actorID, userID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.GetUserAdminByID(ctx, tenantID, userID); err != nil {
			return domain.ErrUserNotFound
		}
		if err := s.repo.ArchiveUserRecord(ctx, tenantID, userID); err != nil {
			return fmt.Errorf("archive user: %w", err)
		}
		return audit.RecordSimple(ctx, tenantID, "user.archive", "user", userID)
	})
}

// RestoreUser reverses ArchiveUser.
func (s *Service) RestoreUser(ctx context.Context, tenantID, userID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.GetUserAdminByID(ctx, tenantID, userID); err != nil {
			return domain.ErrUserNotFound
		}
		if err := s.repo.RestoreUserRecord(ctx, tenantID, userID); err != nil {
			return fmt.Errorf("restore user: %w", err)
		}
		return audit.RecordSimple(ctx, tenantID, "user.restore", "user", userID)
	})
}

// ResetPasswordByAdmin creates a one-time set-password token for userID and
// returns it in plaintext exactly once; only its SHA-256 hash is stored
// (docs/08-security.md section 2: "admin reset menghasilkan tautan
// set-password, bukan password").
func (s *Service) ResetPasswordByAdmin(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	var token string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.GetUserAdminByID(ctx, tenantID, userID); err != nil {
			return domain.ErrUserNotFound
		}

		var hash []byte
		var err error
		token, hash, err = auth.NewRefreshToken()
		if err != nil {
			return err
		}

		now := s.clock.Now()
		if err := s.repo.CreatePasswordResetRecord(ctx, NewPasswordReset{
			TenantID: tenantID, UserID: userID, TokenHash: hash, Channel: "admin",
			ExpiresAt: now.Add(passwordResetTTL),
		}); err != nil {
			return fmt.Errorf("create password reset: %w", err)
		}
		return audit.RecordSimple(ctx, tenantID, "user.reset_password", "user", userID)
	})
	return token, err
}

func ptrAuditUser(a auditUser) *auditUser { return &a }
