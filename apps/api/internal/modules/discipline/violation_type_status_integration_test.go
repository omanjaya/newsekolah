package discipline

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func typeCodes(types []domain.ViolationType) map[string]bool {
	out := map[string]bool{}
	for _, vt := range types {
		out[vt.Code] = vt.IsActive
	}
	return out
}

// TestViolationTypeDeactivateKeepsItListedAndRestorable covers what the
// catalog's "Nonaktifkan" does now: an update to is_active=false, after
// which the type is still listed under include_inactive and can be
// switched back on.
func TestViolationTypeDeactivateKeepsItListedAndRestorable(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "LN01", Name: "Membawa barang elektronik", Points: 15})
	require.NoError(t, err)

	vt.IsActive = false
	_, err = mod.Service.UpdateViolationType(ctx, vt)
	require.NoError(t, err)

	active, err := mod.Service.ListViolationTypes(ctx, fx.tenantID, false, "")
	require.NoError(t, err)
	require.NotContains(t, typeCodes(active), "LN01")
	all, err := mod.Service.ListViolationTypes(ctx, fx.tenantID, true, "")
	require.NoError(t, err)
	isActive, listed := typeCodes(all)["LN01"]
	require.True(t, listed, "a deactivated type stays listed under include_inactive")
	require.False(t, isActive)

	vt.IsActive = true
	restored, err := mod.Service.UpdateViolationType(ctx, vt)
	require.NoError(t, err)
	require.True(t, restored.IsActive)
}

// TestViolationTypeDeleteFreesItsCode: a type removed through DELETE no
// longer holds its code, so the school can add a new type under it.
func TestViolationTypeDeleteFreesItsCode(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "LN01", Name: "Lama", Points: 15})
	require.NoError(t, err)
	_, err = mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "LN01", Name: "Kembar", Points: 5})
	require.ErrorIs(t, err, domain.ErrViolationTypeCodeExists, "two live types still cannot share a code")

	require.NoError(t, mod.Service.DeleteViolationType(ctx, fx.tenantID, vt.ID))
	again, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "LN01", Name: "Baru", Points: 10})
	require.NoError(t, err)
	require.NotEqual(t, vt.ID, again.ID)
}
