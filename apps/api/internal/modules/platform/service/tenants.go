package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// TenantDetail is a tenant's health summary plus its module flags, for the
// console's per-tenant panel.
type TenantDetail struct {
	domain.TenantHealth
	Flags []domain.ModuleFlag
}

// CreateTenantResult carries the new tenant and its first admin's
// credentials; AdminPassword is never stored and never appears again.
type CreateTenantResult struct {
	Tenant        domain.Tenant
	AdminUsername string
	AdminPassword string
}

// ListTenants returns every tenant with its health summary: user count,
// active academic year, last recorded activity, and the storage bucket
// its documents live in.
func (s *Service) ListTenants(ctx context.Context) ([]domain.TenantHealth, error) {
	if err := s.guard(); err != nil {
		return nil, err
	}
	tenants, err := s.repo.ListTenants(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.TenantHealth, len(tenants))
	for i, t := range tenants {
		health, err := s.health(ctx, t)
		if err != nil {
			return nil, err
		}
		out[i] = health
	}
	return out, nil
}

// GetTenantDetail returns one tenant's health summary and module flags.
func (s *Service) GetTenantDetail(ctx context.Context, id uuid.UUID) (TenantDetail, error) {
	if err := s.guard(); err != nil {
		return TenantDetail{}, err
	}
	t, ok, err := s.repo.GetTenant(ctx, id)
	if err != nil {
		return TenantDetail{}, err
	}
	if !ok {
		return TenantDetail{}, domain.ErrTenantNotFound
	}
	health, err := s.health(ctx, t)
	if err != nil {
		return TenantDetail{}, err
	}
	var flags []domain.ModuleFlag
	err = s.withTx(ctx, id, func(ctx context.Context) error {
		var err error
		flags, err = s.repo.ListFeatureFlags(ctx, id)
		return err
	})
	if err != nil {
		return TenantDetail{}, err
	}
	return TenantDetail{TenantHealth: health, Flags: flags}, nil
}

func (s *Service) health(ctx context.Context, t domain.Tenant) (domain.TenantHealth, error) {
	health := domain.TenantHealth{Tenant: t, StorageBucket: s.bucket}
	err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
		var err error
		health.UserCount, err = s.repo.CountUsers(ctx, t.ID)
		if err != nil {
			return err
		}
		label, ok, err := s.repo.ActiveAcademicYearLabel(ctx, t.ID)
		if err != nil {
			return err
		}
		if ok {
			health.ActiveAcademicYear = label
		}
		health.LastActivityAt, err = s.repo.LastActivityAt(ctx, t.ID)
		return err
	})
	return health, err
}

// CreateTenant provisions a brand-new tenant and its first administrator
// in one call: the admin's role is granted every tenant-level permission
// except the platform console itself, and its password is generated here
// and returned exactly once (docs/08-security.md never persists it).
//
// All three steps -- create the tenant row, provision its admin user,
// create every other system role/duty type/library member type it is
// missing -- run in one transaction (withPlatformTx) rather than each
// committing independently. Without that, a failure in the last step (say,
// creating duty types) would leave a tenant and its admin already
// committed but with no "homeroom" duty type, which leaves a school unable
// to name a homeroom teacher at all -- a half-provisioned tenant with no
// compensating cleanup. One transaction was chosen over explicit
// cleanup-on-failure because every step here already goes through the
// ordinary tenant-scoped repository calls (no external side effects like
// sending an email that a rollback could not undo), so there is nothing a
// transaction can't clean up on its own, and it avoids a second failure
// mode (cleanup itself failing and leaving the same half-provisioned
// tenant behind).
func (s *Service) CreateTenant(ctx context.Context, in domain.TenantInput) (CreateTenantResult, error) {
	if err := s.guard(); err != nil {
		return CreateTenantResult{}, err
	}
	if err := in.Validate(); err != nil {
		return CreateTenantResult{}, err
	}

	var result CreateTenantResult
	err := s.withPlatformTx(ctx, func(ctx context.Context) error {
		tenant, err := s.repo.CreateTenant(ctx, in)
		if err != nil {
			return err
		}

		admin, err := s.admin.ProvisionAdmin(ctx, tenant.ID, AdminInput{
			Username: in.AdminUsername, Email: in.AdminEmail, Name: in.AdminName,
		})
		if err != nil {
			return err
		}

		if err := s.admin.EnsureTenantDefaults(ctx, tenant.ID); err != nil {
			return err
		}

		result = CreateTenantResult{Tenant: tenant, AdminUsername: admin.Username, AdminPassword: admin.Password}
		return nil
	})
	return result, err
}

// SuspendTenant blocks a tenant from signing in without deleting anything.
func (s *Service) SuspendTenant(ctx context.Context, id uuid.UUID) (domain.Tenant, error) {
	return s.setStatus(ctx, id, domain.StatusSuspended)
}

// ResumeTenant reverses SuspendTenant.
func (s *Service) ResumeTenant(ctx context.Context, id uuid.UUID) (domain.Tenant, error) {
	return s.setStatus(ctx, id, domain.StatusActive)
}

func (s *Service) setStatus(ctx context.Context, id uuid.UUID, status domain.TenantStatus) (domain.Tenant, error) {
	if err := s.guard(); err != nil {
		return domain.Tenant{}, err
	}
	t, ok, err := s.repo.UpdateTenantStatus(ctx, id, status)
	if err != nil {
		return domain.Tenant{}, err
	}
	if !ok {
		return domain.Tenant{}, domain.ErrTenantNotFound
	}
	return t, nil
}

// UpdateTenantDomain sets a tenant's custom domain. Domain ownership
// verification is a separate concern this console does not implement yet
// (see the report at the end of this slice).
func (s *Service) UpdateTenantDomain(ctx context.Context, id uuid.UUID, host string) (domain.Tenant, error) {
	if err := s.guard(); err != nil {
		return domain.Tenant{}, err
	}
	if !domain.ValidHost(host) {
		return domain.Tenant{}, domain.ErrInvalidInput
	}
	t, ok, err := s.repo.UpdateTenantDomain(ctx, id, host)
	if err != nil {
		return domain.Tenant{}, err
	}
	if !ok {
		return domain.Tenant{}, domain.ErrTenantNotFound
	}
	return t, nil
}
