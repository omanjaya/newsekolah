package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
)

// newGuardedService builds a Service with every collaborator left nil: in
// single-tenant mode none of them should ever be reached, so a nil
// dereference inside a test case is itself proof the guard was skipped.
func newGuardedService(mode config.TenancyMode) *Service {
	return New(nil, nil, nil, nil, nil, clock.Frozen{At: time.Unix(0, 0)}, mode, "", nil)
}

// TestTenancyModeRefusal is the table test the task calls for: every
// tenant-facing operation must refuse outright in single-tenant mode,
// before touching the repository or any adapter.
func TestTenancyModeRefusal(t *testing.T) {
	ctx := context.Background()
	id := uuid.New()
	svc := newGuardedService(config.TenancySingle)

	cases := []struct {
		name string
		call func() error
	}{
		{"ListTenants", func() error { _, err := svc.ListTenants(ctx); return err }},
		{"GetTenantDetail", func() error { _, err := svc.GetTenantDetail(ctx, id); return err }},
		{"CreateTenant", func() error {
			_, err := svc.CreateTenant(ctx, domain.TenantInput{
				Slug: "test-school", Name: "Test", EducationLevel: "sma",
				Timezone: "Asia/Makassar", AdminUsername: "admin", AdminName: "Admin",
			})
			return err
		}},
		{"SuspendTenant", func() error { _, err := svc.SuspendTenant(ctx, id); return err }},
		{"ResumeTenant", func() error { _, err := svc.ResumeTenant(ctx, id); return err }},
		{"UpdateTenantDomain", func() error { _, err := svc.UpdateTenantDomain(ctx, id, "school.example.com"); return err }},
		{"ListFlags", func() error { _, err := svc.ListFlags(ctx, id); return err }},
		{"SetFlag", func() error { _, err := svc.SetFlag(ctx, id, "library", true); return err }},
		{"RequestExport", func() error { _, err := svc.RequestExport(ctx, id); return err }},
		{"GetExport", func() error { _, err := svc.GetExport(ctx, id, id); return err }},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.call()
			if !errors.Is(err, domain.ErrTenancyDisabled) {
				t.Errorf("%s in single-tenant mode: got %v, want ErrTenancyDisabled", tt.name, err)
			}
		})
	}
}

// TestTenancyModeAllowsMulti confirms the guard is not simply "always
// refuse": in multi-tenant mode CreateTenant's own validation error still
// surfaces, proving the call reached past the guard.
func TestTenancyModeAllowsMulti(t *testing.T) {
	svc := newGuardedService(config.TenancyMulti)
	_, err := svc.CreateTenant(context.Background(), domain.TenantInput{})
	if errors.Is(err, domain.ErrTenancyDisabled) {
		t.Fatal("multi-tenant mode should not refuse with ErrTenancyDisabled")
	}
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("got %v, want ErrInvalidInput from validation", err)
	}
}
