package service_test

import (
	"bytes"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// A stocktake's live counters did not add up (scanned counted the copies
// that were not expected on the shelf, missing did not) and its xlsx
// listed bare accession numbers with raw English codes, so the librarian
// could not tell which book was missing.
func TestStocktakeCountsAddUpAndTheReportNamesTheBooks(t *testing.T) {
	f := newImportFixture(t, "stocktake-test")
	var librarian, location uuid.UUID
	require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx, `insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,'pustakawan','x','Pustakawan','active','id') returning id`, f.tenant).Scan(&librarian))
	require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx, `insert into library_locations (tenant_id,code,name)
		values ($1,'rak-a','Rak A') returning id`, f.tenant).Scan(&location))

	copyOf := func(title, barcode, status string) {
		t.Helper()
		var titleID uuid.UUID
		require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx, `insert into library_titles (tenant_id,title) values ($1,$2) returning id`,
			f.tenant, title).Scan(&titleID))
		_, err := f.pg.AdminPool.Exec(f.ctx, `insert into library_copies (tenant_id,title_id,barcode,accession_number,status,location_id)
			values ($1,$2,$3,$3,$4,$5)`, f.tenant, titleID, barcode, status, location)
		require.NoError(t, err)
	}
	copyOf("Laskar Pelangi", "B-1", "available")
	copyOf("Bumi Manusia", "B-2", "available")
	copyOf("Negeri 5 Menara", "B-3", "available")
	copyOf("Sapiens", "B-4", "on_loan")

	st, err := f.svc.StartStocktake(f.ctx, f.tenant, "Opname November", librarian, "")
	require.NoError(t, err)
	_, err = f.svc.ScanCodes(f.ctx, f.tenant, st.ID, []string{"B-1", "B-4", "B-1"}, uuid.NullUUID{}, librarian)
	require.NoError(t, err)

	progress, err := f.svc.StocktakeProgress(f.ctx, f.tenant, st.ID)
	require.NoError(t, err)
	require.Equal(t, 3, progress.ExpectedCount)
	require.Equal(t, 1, progress.ScannedCount, "only expected copies count as scanned")
	require.Equal(t, 2, progress.MissingCount)
	require.Equal(t, 1, progress.UnexpectedCount, "the copy on loan")
	require.Equal(t, progress.ExpectedCount, progress.ScannedCount+progress.MissingCount)

	closed, err := f.svc.Close(f.ctx, f.tenant, st.ID, "", domain.MarkMissingAsNone, librarian)
	require.NoError(t, err)
	persisted, err := f.svc.StocktakeResults(f.ctx, f.tenant, st.ID)
	require.NoError(t, err)
	require.Equal(t, closed.ExpectedCount, persisted.ExpectedCount)
	require.Equal(t, closed.ScannedCount, persisted.ScannedCount)

	out, err := f.svc.StocktakeReportXLSX(f.ctx, f.tenant, st.ID)
	require.NoError(t, err)
	book, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer func() { _ = book.Close() }()

	missing, err := book.GetRows("Hilang")
	require.NoError(t, err)
	require.Contains(t, missing[0][0], "Opname November")
	require.Equal(t, []string{"Judul", "Nomor Induk", "Barcode", "Nomor Panggil", "Lokasi", "Kondisi", "Status"}, missing[1])
	titles := []string{missing[2][0], missing[3][0]}
	require.ElementsMatch(t, []string{"Bumi Manusia", "Negeri 5 Menara"}, titles)
	require.Equal(t, []string{"Rak A", "Baik", "Tersedia"}, missing[2][4:7])

	unexpected, err := book.GetRows("Tidak Terduga")
	require.NoError(t, err)
	require.Equal(t, "Sapiens", unexpected[2][0])
	require.Equal(t, "Dipinjam", unexpected[2][6])
}
