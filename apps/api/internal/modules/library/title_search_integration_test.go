package library

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestTitleSearchMatchesAWordTypedHalfway proves the catalogue list (also
// the reservation and class-loan pickers) and the public OPAC find a title
// from the first letters of its words, not only from whole words: a
// search-as-you-type field must not lose "Laskar Pelangi" at "Lask", nor
// an author typed with initials or an academic title ("J.K. Row", "M.Pd").
func TestTitleSearchMatchesAWordTypedHalfway(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "search-"+uuid.NewString()[:8])
	for _, title := range [][2]string{
		{"Laskar Pelangi", "Andrea Hirata"},
		{"Sapiens", "Yuval Noah Harari"},
		{"Bumi Manusia", "Pramoedya Ananta Toer"},
		{"Harry Potter 2.0", "J.K. Rowling"},
		{"Bahasa Inggris 10/2", "Dr. Ani, M.Pd."},
		{"Matematika Dasar", "Budi Santoso, S.Pd"},
	} {
		_, err := pg.AdminPool.Exec(ctx, `insert into library_titles (tenant_id, title, author) values ($1, $2, $3)`,
			w.tenantID, title[0], title[1])
		require.NoError(t, err)
	}

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, nil)

	cases := map[string][]string{
		"Lask":       {"Laskar Pelangi"},
		"Sap":        {"Sapiens"},
		"laskar pel": {"Laskar Pelangi"},
		"Laskar":     {"Laskar Pelangi"},
		"hirat":      {"Laskar Pelangi"},
		"La":         {"Laskar Pelangi"},
		"Lask zzz":   nil,
		"!!!":        nil,
		// Initials, academic titles, editions and class numbers keep their
		// dots and slashes as one lexeme in search_vector, so the query must
		// not split them into separate words.
		"J.K. Row":   {"Harry Potter 2.0"},
		"j.k.":       {"Harry Potter 2.0"},
		"M.Pd":       {"Bahasa Inggris 10/2"},
		"S.Pd":       {"Matematika Dasar"},
		"2.0":        {"Harry Potter 2.0"},
		"Potter 2.0": {"Harry Potter 2.0"},
		"10/2":       {"Bahasa Inggris 10/2"},
		"o'brien &":  nil,
	}
	for search, want := range cases {
		titles, err := svc.ListTitles(ctx, w.tenantID, service.TitleSearch{Search: search, Limit: 50})
		require.NoError(t, err, "catalogue %q", search)
		require.ElementsMatch(t, want, catalogueNames(titles), "catalogue %q", search)

		opac, err := svc.OpacSearch(ctx, w.tenantID, service.OpacSearchParams{Search: search, Limit: 50})
		require.NoError(t, err, "opac %q", search)
		require.ElementsMatch(t, want, catalogueNames(opac), "opac %q", search)
	}

	// The OPAC still orders by ts_rank with the prefix query: the title
	// whose words match more often comes first, not plain title order.
	_, err := pg.AdminPool.Exec(ctx, `insert into library_titles (tenant_id, title, author) values ($1, 'Catatan Pelangi', 'Pelangi Pelangi')`, w.tenantID)
	require.NoError(t, err)
	opac, err := svc.OpacSearch(ctx, w.tenantID, service.OpacSearchParams{Search: "Pelangi", Limit: 50})
	require.NoError(t, err)
	require.Equal(t, []string{"Catatan Pelangi", "Laskar Pelangi"}, catalogueNames(opac))
}

func catalogueNames(titles []service.TitleWithAvailability) []string {
	var out []string
	for _, t := range titles {
		if t.Title.Title == "Judul Simulasi" {
			continue // the seed world's own title
		}
		out = append(out, t.Title.Title)
	}
	return out
}
