package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// RoleRecord is one roles row.
type RoleRecord struct {
	ID          uuid.UUID
	Slug        string
	Name        string
	Description string
	IsSystem    bool
}

// PermissionRecord is one permissions row (the static catalog, seeded from
// authz.Catalog by migrator.PostUp).
type PermissionRecord struct {
	Code        string
	Group       string
	Description string
}

// RoleView adds the permission codes and, when requested, the assigned
// user count to a RoleRecord.
type RoleView struct {
	RoleRecord
	Permissions []string
	UserCount   *int
}

// RolesRepository is the data-access boundary for role and permission
// administration.
type RolesRepository interface {
	ListRolesByTenant(ctx context.Context, tenantID uuid.UUID) ([]RoleRecord, error)
	GetRoleByID(ctx context.Context, tenantID, roleID uuid.UUID) (RoleRecord, error)
	GetRoleBySlug(ctx context.Context, tenantID uuid.UUID, slug string) (RoleRecord, error)
	CreateRoleRecord(ctx context.Context, tenantID uuid.UUID, slug, name, description string) (RoleRecord, error)
	UpdateRoleRecord(ctx context.Context, tenantID, roleID uuid.UUID, slug, name, description string) error
	DeleteRoleRecord(ctx context.Context, tenantID, roleID uuid.UUID) error
	CountUsersForRole(ctx context.Context, tenantID, roleID uuid.UUID) (int64, error)
	DeleteRolePermissions(ctx context.Context, tenantID, roleID uuid.UUID) error
	AddRolePermissionRecord(ctx context.Context, tenantID, roleID uuid.UUID, code string) error
	ListRolePermissionCodes(ctx context.Context, tenantID, roleID uuid.UUID) ([]string, error)
	ListPermissionsCatalog(ctx context.Context) ([]PermissionRecord, error)
}

// ListRoles returns every role for the tenant with its permission codes.
func (s *Service) ListRoles(ctx context.Context, tenantID uuid.UUID) ([]RoleView, error) {
	var views []RoleView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		roles, err := s.repo.ListRolesByTenant(ctx, tenantID)
		if err != nil {
			return fmt.Errorf("list roles: %w", err)
		}
		views = make([]RoleView, len(roles))
		for i, r := range roles {
			perms, err := s.repo.ListRolePermissionCodes(ctx, tenantID, r.ID)
			if err != nil {
				return fmt.Errorf("list permissions for role %s: %w", r.ID, err)
			}
			views[i] = RoleView{RoleRecord: r, Permissions: perms}
		}
		return nil
	})
	return views, err
}

// PermissionCatalog groups the static permission catalog by its group_name,
// for the admin UI's role-permission matrix.
func (s *Service) PermissionCatalog(ctx context.Context) (map[string][]PermissionRecord, error) {
	perms, err := s.repo.ListPermissionsCatalog(ctx)
	if err != nil {
		return nil, fmt.Errorf("list permission catalog: %w", err)
	}
	grouped := map[string][]PermissionRecord{}
	for _, p := range perms {
		grouped[p.Group] = append(grouped[p.Group], p)
	}
	return grouped, nil
}

// CreateRole creates a tenant-custom role (never is_system: only migrations
// seed system roles).
func (s *Service) CreateRole(ctx context.Context, tenantID uuid.UUID, slug, name, description string) (RoleView, error) {
	if err := domain.ValidateRoleSlug(slug); err != nil {
		return RoleView{}, err
	}

	var view RoleView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		role, err := s.repo.CreateRoleRecord(ctx, tenantID, slug, name, description)
		if err != nil {
			return fmt.Errorf("create role: %w", err)
		}
		if err := audit.Record(ctx, tenantID, "role.create", "role", role.ID, nil, role); err != nil {
			return err
		}
		view = RoleView{RoleRecord: role}
		return nil
	})
	return view, err
}

// UpdateRole renames/redescribes a role. A system role's slug and name are
// immutable (docs/analysis/backend-inventory.md section 1.3).
func (s *Service) UpdateRole(ctx context.Context, tenantID, roleID uuid.UUID, slug, name, description string) (RoleView, error) {
	if err := domain.ValidateRoleSlug(slug); err != nil {
		return RoleView{}, err
	}

	var view RoleView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetRoleByID(ctx, tenantID, roleID)
		if err != nil {
			return domain.ErrRoleNotFound
		}
		if err := domain.ValidateRoleMutation(before.IsSystem, before.Slug != slug, before.Name != name); err != nil {
			return err
		}
		if err := s.repo.UpdateRoleRecord(ctx, tenantID, roleID, slug, name, description); err != nil {
			return fmt.Errorf("update role: %w", err)
		}
		after := RoleRecord{ID: roleID, Slug: slug, Name: name, Description: description, IsSystem: before.IsSystem}
		if err := audit.Record(ctx, tenantID, "role.update", "role", roleID, before, after); err != nil {
			return err
		}
		view = RoleView{RoleRecord: after}
		return nil
	})
	return view, err
}

// DeleteRole removes a role, refusing a system role or one still held by a
// user.
func (s *Service) DeleteRole(ctx context.Context, tenantID, roleID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		role, err := s.repo.GetRoleByID(ctx, tenantID, roleID)
		if err != nil {
			return domain.ErrRoleNotFound
		}
		count, err := s.repo.CountUsersForRole(ctx, tenantID, roleID)
		if err != nil {
			return fmt.Errorf("count users for role: %w", err)
		}
		if err := domain.ValidateRoleDeletable(role.IsSystem, int(count)); err != nil {
			return err
		}
		if err := s.repo.DeleteRoleRecord(ctx, tenantID, roleID); err != nil {
			return fmt.Errorf("delete role: %w", err)
		}
		return audit.Record(ctx, tenantID, "role.delete", "role", roleID, role, nil)
	})
}

// RoleUserCount returns how many users currently hold roleID, for the
// "delete disabled while in use" affordance in the admin UI.
func (s *Service) RoleUserCount(ctx context.Context, tenantID, roleID uuid.UUID) (int, error) {
	var count int64
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.GetRoleByID(ctx, tenantID, roleID); err != nil {
			return domain.ErrRoleNotFound
		}
		var err error
		count, err = s.repo.CountUsersForRole(ctx, tenantID, roleID)
		return err
	})
	return int(count), err
}

// ReplaceRolePermissions replaces every permission grant of roleID with
// codes. The super_admin role always ends up with every catalog
// permission, regardless of what was requested, so it can never be
// accidentally weakened (docs/analysis/backend-inventory.md section 1.3:
// "permission super_admin tidak bisa diubah").
func (s *Service) ReplaceRolePermissions(ctx context.Context, tenantID, roleID uuid.UUID, codes []string) (RoleView, error) {
	known := knownPermissionSet()
	for _, c := range codes {
		if !known.Has(c) {
			return RoleView{}, domain.ErrUnknownPermission
		}
	}

	var view RoleView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		role, err := s.repo.GetRoleByID(ctx, tenantID, roleID)
		if err != nil {
			return domain.ErrRoleNotFound
		}
		// review_leave_requests and issue_leave_letters must reach the
		// teacher role only through a homeroom/counselor duty assignment,
		// never as a direct grant (docs/analysis/backend-inventory.md
		// section 1.3).
		if role.Slug == authz.RoleSlugTeacher {
			for _, c := range codes {
				if c == authz.PermReviewLeaveRequests || c == authz.PermIssueLeaveLetters {
					return domain.ErrLeavePermissionDirect
				}
			}
		}
		before, err := s.repo.ListRolePermissionCodes(ctx, tenantID, roleID)
		if err != nil {
			return fmt.Errorf("list current permissions: %w", err)
		}

		effective := codes
		if role.Slug == domain.SuperAdminRoleSlug {
			effective = authz.Codes()
		}

		if err := s.repo.DeleteRolePermissions(ctx, tenantID, roleID); err != nil {
			return fmt.Errorf("clear role permissions: %w", err)
		}
		for _, code := range effective {
			if err := s.repo.AddRolePermissionRecord(ctx, tenantID, roleID, code); err != nil {
				return fmt.Errorf("grant permission %s: %w", code, err)
			}
		}

		if err := audit.Record(ctx, tenantID, "role.replace_permissions", "role", roleID, before, effective); err != nil {
			return err
		}
		view = RoleView{RoleRecord: role, Permissions: effective}
		return nil
	})
	return view, err
}
