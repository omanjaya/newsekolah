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

// newGuardedService builds a Service with every collaborator left nil: the
// refusals below must happen before any of them is reached, so a nil
// dereference inside a test case is itself proof a guard was skipped.
func newGuardedService(mode config.TenancyMode) *Service {
	return New(nil, nil, nil, nil, nil, clock.Frozen{At: time.Unix(0, 0)}, mode, "", nil)
}

// TestTenancyModeRefusal covers the console actions that only make sense
// with several tenants: each must refuse outright in single-tenant mode,
// before touching the repository or any adapter, even for the request's
// own tenant.
func TestTenancyModeRefusal(t *testing.T) {
	id := uuid.New()
	ctx := WithRequestTenant(context.Background(), id)
	svc := newGuardedService(config.TenancySingle)

	cases := []struct {
		name string
		call func() error
	}{
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

// TestSingleModeConsoleRefusesOtherTenants covers the scope half of the
// single-tenant console: reading or toggling any tenant other than the
// request's own answers ErrTenantNotFound before the repository is reached
// (the collaborators are nil, so reaching them would panic), and a context
// without a request tenant lists nothing. The in-scope half runs against
// Postgres in the platform package (TestSingleModeConsoleScopedToOwnTenant).
func TestSingleModeConsoleRefusesOtherTenants(t *testing.T) {
	own, other := uuid.New(), uuid.New()
	ctx := WithRequestTenant(context.Background(), own)
	svc := newGuardedService(config.TenancySingle)

	cases := []struct {
		name string
		ctx  context.Context
		call func(ctx context.Context) error
	}{
		{"GetTenantDetail other", ctx, func(ctx context.Context) error { _, err := svc.GetTenantDetail(ctx, other); return err }},
		{"ListFlags other", ctx, func(ctx context.Context) error { _, err := svc.ListFlags(ctx, other); return err }},
		{"SetFlag other", ctx, func(ctx context.Context) error { _, err := svc.SetFlag(ctx, other, "visitors", false); return err }},
		{"ListFlags without request tenant", context.Background(), func(ctx context.Context) error { _, err := svc.ListFlags(ctx, own); return err }},
		{"SetFlag without request tenant", context.Background(), func(ctx context.Context) error { _, err := svc.SetFlag(ctx, own, "visitors", false); return err }},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.call(tt.ctx); !errors.Is(err, domain.ErrTenantNotFound) {
				t.Errorf("got %v, want ErrTenantNotFound", err)
			}
		})
	}

	t.Run("ListTenants without request tenant", func(t *testing.T) {
		tenants, err := svc.ListTenants(context.Background())
		if err != nil {
			t.Fatalf("ListTenants: %v", err)
		}
		if len(tenants) != 0 {
			t.Errorf("got %d tenants, want none", len(tenants))
		}
	})
}

// TestTenancyModeReported covers what the console reads to decide which
// actions to offer.
func TestTenancyModeReported(t *testing.T) {
	for _, mode := range []config.TenancyMode{config.TenancySingle, config.TenancyMulti} {
		if got := newGuardedService(mode).TenancyMode(); got != mode {
			t.Errorf("TenancyMode() = %q, want %q", got, mode)
		}
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
