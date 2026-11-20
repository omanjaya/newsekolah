package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type importFixture struct {
	ctx    context.Context
	pg     dbtest.Postgres
	tenant uuid.UUID
	svc    *service.Service
}

func newImportFixture(t *testing.T, slug string) importFixture {
	t.Helper()
	ctx := context.Background()
	pg := dbtest.Start(t)
	var tenant uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,'Test School','sma','UTC','id','active','default') returning id`, slug).Scan(&tenant))
	_, err := pg.AdminPool.Exec(ctx, `insert into library_material_types (tenant_id,code,name) values ($1,'bk','Buku')`, tenant)
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, `insert into library_collection_categories (tenant_id,code,name) values ($1,'fiksi','Fiksi')`, tenant)
	require.NoError(t, err)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: time.Date(2026, 11, 20, 9, 0, 0, 0, time.UTC)})
	return importFixture{ctx: ctx, pg: pg, tenant: tenant, svc: svc}
}

// importRow is one row keyed by the internal field names (no mapping).
func importRow(n int, title string, extra map[string]any) map[string]any {
	row := map[string]any{"row_number": float64(n), "title": title, "material_type": "bk", "category": "fiksi"}
	for k, v := range extra {
		row[k] = v
	}
	return row
}

// Imported titles and copies used to be saved with is_opac=false (the Go
// zero value), which hid every imported book from the public catalogue
// and from reservations.
func TestCommitImportPublishesTitlesAndCopiesToTheOPAC(t *testing.T) {
	f := newImportFixture(t, "import-opac-test")

	result, err := f.svc.CommitImport(f.ctx, f.tenant, []map[string]any{
		importRow(1, "Ronggeng Dukuh Paruk", map[string]any{"copies": "2"}),
	}, nil)
	require.NoError(t, err)
	require.Equal(t, service.ImportCommitResult{CreatedTitles: 1, CreatedCopies: 2}, result)

	var hiddenTitles, hiddenCopies int
	require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx,
		`select count(*) from library_titles where tenant_id = $1 and not is_opac`, f.tenant).Scan(&hiddenTitles))
	require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx,
		`select count(*) from library_copies where tenant_id = $1 and not is_opac`, f.tenant).Scan(&hiddenCopies))
	require.Zero(t, hiddenTitles)
	require.Zero(t, hiddenCopies)

	// A title imported before this fix is still hidden, with hidden copies.
	// Switching it to public in the title form publishes the copies too,
	// since copies have no visibility control of their own.
	_, err = f.pg.AdminPool.Exec(f.ctx, `update library_titles set is_opac = false where tenant_id = $1`, f.tenant)
	require.NoError(t, err)
	_, err = f.pg.AdminPool.Exec(f.ctx, `update library_copies set is_opac = false where tenant_id = $1`, f.tenant)
	require.NoError(t, err)
	var titleID uuid.UUID
	require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx, `select id from library_titles where tenant_id = $1`, f.tenant).Scan(&titleID))
	title, err := f.svc.GetTitle(f.ctx, f.tenant, titleID)
	require.NoError(t, err)
	require.False(t, title.IsOPAC)
	edit := title.Title
	edit.IsOPAC = true
	_, err = f.svc.UpdateTitle(f.ctx, edit)
	require.NoError(t, err)
	require.NoError(t, f.pg.AdminPool.QueryRow(f.ctx,
		`select count(*) from library_copies where tenant_id = $1 and not is_opac`, f.tenant).Scan(&hiddenCopies))
	require.Zero(t, hiddenCopies)
}

// The preview used to pass a row whose barcode or No. Induk was already
// taken; the commit then rolled back the whole file with a 409 that named
// no row.
func TestPreviewImportFlagsTakenCopyNumbers(t *testing.T) {
	f := newImportFixture(t, "import-codes-test")
	_, err := f.svc.CommitImport(f.ctx, f.tenant, []map[string]any{
		importRow(1, "Laskar Pelangi", map[string]any{"no_induk": "2026/00001", "barcode": "B-0001"}),
	}, nil)
	require.NoError(t, err)

	rows := []map[string]any{
		importRow(1, "Barcode Dipakai", map[string]any{"barcode": "B-0001"}),
		importRow(2, "Induk Dipakai", map[string]any{"no_induk": "2026/00001"}),
		importRow(3, "Baris Pertama", map[string]any{"barcode": "B-0100"}),
		importRow(4, "Baris Kembar", map[string]any{"barcode": "B-0100"}),
		// Several copies always generate their numbers, so an explicit
		// barcode on such a row is ignored and is no conflict.
		importRow(5, "Banyak Eksemplar", map[string]any{"barcode": "B-0001", "copies": "3"}),
		importRow(6, "Bersih", map[string]any{"barcode": "B-0200", "no_induk": "2026/00200"}),
	}
	preview, err := f.svc.PreviewImport(f.ctx, f.tenant, rows, nil)
	require.NoError(t, err)
	require.Len(t, preview.Rows, 6)

	status := func(i int) (string, string) { return preview.Rows[i].Status, preview.Rows[i].Message }
	s, m := status(0)
	require.Equal(t, "error", s)
	require.Equal(t, "Barcode B-0001 sudah dipakai eksemplar lain.", m)
	s, m = status(1)
	require.Equal(t, "error", s)
	require.Equal(t, "No. induk 2026/00001 sudah dipakai eksemplar lain.", m)
	s, _ = status(2)
	require.Equal(t, "new_title", s)
	s, m = status(3)
	require.Equal(t, "error", s)
	require.Equal(t, "Barcode B-0100 sudah dipakai di baris 3.", m)
	s, _ = status(4)
	require.Equal(t, "new_title", s)
	s, _ = status(5)
	require.Equal(t, "new_title", s)
	require.Equal(t, 3, preview.Summary.Errors)

	// A caller that commits a conflicting row anyway (or a copy created
	// after the preview) gets the row number with the domain error. Row 3
	// goes first: its typed barcode is free but the accession number drawn
	// for it (2026/00001) is the one typed for Laskar Pelangi, so that
	// commit has to retry the generated number inside the transaction
	// rather than give up or abort it.
	_, err = f.svc.CommitImport(f.ctx, f.tenant, []map[string]any{rows[2], rows[0]}, nil)
	var rowErr *domain.ImportRowError
	require.True(t, errors.As(err, &rowErr), "got %v", err)
	require.Equal(t, 1, rowErr.Row)
	require.ErrorIs(t, err, domain.ErrCopyBarcodeExists)

	result, err := f.svc.CommitImport(f.ctx, f.tenant, []map[string]any{rows[2]}, nil)
	require.NoError(t, err)
	require.Equal(t, 1, result.CreatedCopies)
}
