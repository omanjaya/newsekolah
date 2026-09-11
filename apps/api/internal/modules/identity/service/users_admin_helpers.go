package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
)

// resolveNewUsername returns explicit if given (after checking it is free),
// or generates one from name otherwise (docs/analysis/backend-inventory.md
// section 1.5 flags the old app's timestamp-based IDs as a defect this
// replaces).
func (s *Service) resolveNewUsername(ctx context.Context, tenantID uuid.UUID, explicit, name string) (string, error) {
	if explicit != "" {
		explicit = domain.NormalizeUsername(explicit)
		exists, err := s.repo.UsernameExists(ctx, tenantID, explicit)
		if err != nil {
			return "", fmt.Errorf("check username exists: %w", err)
		}
		if exists {
			return "", domain.ErrUserAlreadyExists
		}
		return explicit, nil
	}

	var outErr error
	username, err := domain.GenerateUsername(name, func(candidate string) bool {
		if outErr != nil {
			return true
		}
		exists, err := s.repo.UsernameExists(ctx, tenantID, candidate)
		if err != nil {
			outErr = err
			return true
		}
		return exists
	})
	if outErr != nil {
		return "", fmt.Errorf("check generated username: %w", outErr)
	}
	if err != nil {
		return "", err
	}
	return username, nil
}

// EmailExists reports whether email belongs to a user of tenantID. Exposed
// for other modules that need to validate a caller-supplied address is a
// real account (e.g. reports' schedule recipients) without importing
// identity's repository directly.
func (s *Service) EmailExists(ctx context.Context, tenantID uuid.UUID, email string) (bool, error) {
	return s.repo.EmailExists(ctx, tenantID, email)
}

func (s *Service) checkEmailFree(ctx context.Context, tenantID uuid.UUID, email string) error {
	if email == "" {
		return nil
	}
	exists, err := s.repo.EmailExists(ctx, tenantID, email)
	if err != nil {
		return fmt.Errorf("check email exists: %w", err)
	}
	if exists {
		return domain.ErrUserAlreadyExists
	}
	return nil
}

// hashInitialPassword hashes password, or a fresh random one when password
// is blank (docs/08-security.md section 2: never a plaintext password
// returned by an admin-driven creation).
func (s *Service) hashInitialPassword(password string) (string, error) {
	if password == "" {
		var err error
		password, err = auth.NewRandomPassword()
		if err != nil {
			return "", err
		}
	} else if err := domain.ValidatePasswordPolicy(password); err != nil {
		return "", err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return hash, nil
}

// writeProfile persists the shared user_profiles row plus whichever
// kind-specific table applies. A "parent" profile has no additional table.
func (s *Service) writeProfile(ctx context.Context, tenantID, userID uuid.UUID, kind domain.ProfileKind, f UserProfileFields) error {
	if err := s.repo.UpsertUserProfile(ctx, tenantID, userID, kind, f); err != nil {
		return fmt.Errorf("upsert user profile: %w", err)
	}
	switch kind {
	case domain.ProfileStudent:
		if err := s.repo.UpsertStudentProfile(ctx, tenantID, userID, f); err != nil {
			return fmt.Errorf("upsert student profile: %w", err)
		}
	case domain.ProfileTeacher:
		if err := s.repo.UpsertTeacherProfile(ctx, tenantID, userID, f); err != nil {
			return fmt.Errorf("upsert teacher profile: %w", err)
		}
	case domain.ProfileStaff:
		if err := s.repo.UpsertStaffProfile(ctx, tenantID, userID, f); err != nil {
			return fmt.Errorf("upsert staff profile: %w", err)
		}
	}
	return nil
}

// prepareRoleGrants resolves each grant's role slug to its ID and enforces
// the primary-role and super_admin-grant invariants before anything is
// written.
func (s *Service) prepareRoleGrants(ctx context.Context, tenantID, actorID uuid.UUID, grants []domain.RoleGrant) ([]domain.RoleGrant, error) {
	actorIsSuper, err := s.isSuperAdmin(ctx, actorID)
	if err != nil {
		return nil, err
	}

	resolved := make([]domain.RoleGrant, len(grants))
	for i, g := range grants {
		// The HTTP contract sends role IDs; the Excel import sends slugs.
		var (
			role RoleRecord
			err  error
		)
		if g.RoleID != uuid.Nil {
			role, err = s.repo.GetRoleByID(ctx, tenantID, g.RoleID)
		} else {
			role, err = s.repo.GetRoleBySlug(ctx, tenantID, g.Slug)
		}
		if err != nil {
			return nil, fmt.Errorf("role %q/%s: %w", g.Slug, g.RoleID, domain.ErrRoleNotFound)
		}
		resolved[i] = domain.RoleGrant{RoleID: role.ID, Slug: role.Slug, IsPrimary: g.IsPrimary, IsSystem: role.IsSystem}
	}

	if err := domain.ValidateRoleGrants(actorIsSuper, resolved); err != nil {
		return nil, err
	}
	return resolved, nil
}

func (s *Service) applyRoleGrants(ctx context.Context, tenantID, userID uuid.UUID, grants []domain.RoleGrant) error {
	for _, g := range grants {
		if err := s.repo.AssignUserRoleRecord(ctx, tenantID, userID, g.RoleID, g.IsPrimary); err != nil {
			return fmt.Errorf("assign role %s: %w", g.Slug, err)
		}
	}
	return nil
}
