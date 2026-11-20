package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

// A title catalogued by hand got the call number "PRA b" without its class
// number, and nothing in the UI could ever fix it: the form had no DDC
// field, and the stored call number was sent back unchanged on every edit.
func TestTitleCallNumberFollowsTheClassNumber(t *testing.T) {
	f := newImportFixture(t, "call-number-test")

	created, copies, err := f.svc.CreateTitle(f.ctx, domain.Title{
		TenantID: f.tenant, Title: "Bumi Manusia", Author: "Pramoedya Ananta Toer", DDCNumber: "899.221", IsOPAC: true,
	}, 1, service.CopyDefaults{})
	require.NoError(t, err)
	require.Equal(t, "899.221 PRA b", created.CallNumber)
	require.Equal(t, "899.221 PRA b", copies[0].CallNumber)

	// The free-text classification counts when it is itself a DDC number.
	fromClassification, _, err := f.svc.CreateTitle(f.ctx, domain.Title{
		TenantID: f.tenant, Title: "Laskar Pelangi", Author: "Andrea Hirata", Classification: "899.221",
	}, 0, service.CopyDefaults{})
	require.NoError(t, err)
	require.Equal(t, "899.221 AND l", fromClassification.CallNumber)

	// Editing the DDC regenerates a generated call number, even though the
	// form sends the stored one back, and the copy that inherited it
	// follows so its spine label is right.
	edit := created
	edit.DDCNumber = "899.2213"
	updated, err := f.svc.UpdateTitle(f.ctx, edit)
	require.NoError(t, err)
	require.Equal(t, "899.2213 PRA b", updated.CallNumber)
	listed, err := f.svc.ListCopies(f.ctx, f.tenant, created.ID)
	require.NoError(t, err)
	require.Equal(t, "899.2213 PRA b", listed[0].CallNumber)

	// A call number the librarian typed is kept through later edits.
	edit = updated
	edit.CallNumber = "R 899.2213 PRA b"
	updated, err = f.svc.UpdateTitle(f.ctx, edit)
	require.NoError(t, err)
	require.Equal(t, "R 899.2213 PRA b", updated.CallNumber)
	edit = updated
	edit.DDCNumber = "899.22"
	updated, err = f.svc.UpdateTitle(f.ctx, edit)
	require.NoError(t, err)
	require.Equal(t, "R 899.2213 PRA b", updated.CallNumber)

	// A title catalogued by hand before the class number was read from the
	// classification stored "PRA b". Filling in its DDC number regenerates
	// the call number although the current rule would build "899.221 PRA b"
	// from what is stored, and its copy follows.
	legacy, legacyCopies, err := f.svc.CreateTitle(f.ctx, domain.Title{
		TenantID: f.tenant, Title: "Bumi Manusia", Author: "Pramoedya Ananta Toer",
		Classification: "899.221", CallNumber: "PRA b",
	}, 1, service.CopyDefaults{})
	require.NoError(t, err)
	require.Equal(t, "PRA b", legacy.CallNumber)
	require.Equal(t, "PRA b", legacyCopies[0].CallNumber)
	edit = legacy
	edit.DDCNumber = "899.221"
	updated, err = f.svc.UpdateTitle(f.ctx, edit)
	require.NoError(t, err)
	require.Equal(t, "899.221 PRA b", updated.CallNumber)
	listed, err = f.svc.ListCopies(f.ctx, f.tenant, legacy.ID)
	require.NoError(t, err)
	require.Equal(t, "899.221 PRA b", listed[0].CallNumber)
}
