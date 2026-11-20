package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

// The catalogue's Klasifikasi filter sends the top-level class code
// ("800 - Sastra"), and the list matched it as a literal prefix of the DDC
// number, so 899.221 never showed under 800 and every class came back
// empty for typical numbers.
func TestListTitlesFiltersByDDCMainClass(t *testing.T) {
	f := newImportFixture(t, "ddc-filter-test")

	for _, title := range []domain.Title{
		{TenantID: f.tenant, Title: "Laskar Pelangi", Author: "Andrea Hirata", DDCNumber: "899.221"},
		{TenantID: f.tenant, Title: "Teori Sastra", Author: "Budi Darma", DDCNumber: "801.95"},
		{TenantID: f.tenant, Title: "Sejarah Indonesia", Author: "Sartono", DDCNumber: "959.8"},
		{TenantID: f.tenant, Title: "Ilmu Komputer", Author: "Anonim", DDCNumber: "004.1"},
		{TenantID: f.tenant, Title: "Tanpa Klasifikasi", Author: "Anonim"},
	} {
		_, _, err := f.svc.CreateTitle(f.ctx, title, 0, service.CopyDefaults{})
		require.NoError(t, err)
	}

	titlesIn := func(class string) []string {
		t.Helper()
		rows, err := f.svc.ListTitles(f.ctx, f.tenant, service.TitleSearch{DDCClass: class, Limit: 50})
		require.NoError(t, err)
		names := make([]string, len(rows))
		for i, row := range rows {
			names[i] = row.Title.Title
		}
		return names
	}

	require.ElementsMatch(t, []string{"Laskar Pelangi", "Teori Sastra"}, titlesIn("800"))
	require.ElementsMatch(t, []string{"Sejarah Indonesia"}, titlesIn("900"))
	require.ElementsMatch(t, []string{"Ilmu Komputer"}, titlesIn("000"))
	require.Empty(t, titlesIn("500"))
	// A division or a finer prefix narrows within the class.
	require.ElementsMatch(t, []string{"Laskar Pelangi"}, titlesIn("890"))
	require.ElementsMatch(t, []string{"Laskar Pelangi"}, titlesIn("899"))
	require.Len(t, titlesIn(""), 5)
}
