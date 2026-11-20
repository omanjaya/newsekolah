package service

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

// The skip list in the downloaded file is read by school staff, not code:
// it carries the readable reason, never the enum value.
func TestEraporFileWritesReadableSkipReasons(t *testing.T) {
	export := domain.EraporExport{
		Skipped: []domain.EraporSkip{
			{StudentName: "Siswa Dua Contoh", SubjectName: "Matematika", Reason: domain.EraporSkipNoScore},
			{StudentName: "Siswa Contoh", SubjectName: "Kimia", Reason: domain.EraporSkipSubjectNotPublished},
			{StudentName: "Siswa Tiga", SubjectName: "Fisika", Reason: domain.EraporSkipMissingNISN},
		},
	}

	csv, err := renderEraporCSV(export)
	require.NoError(t, err)
	text := string(csv)
	require.Contains(t, text, "Siswa Dua Contoh,Matematika,Siswa belum punya nilai rapor")
	require.Contains(t, text, "Siswa Contoh,Kimia,Nilai mapel belum diterbitkan")
	require.Contains(t, text, "Siswa Tiga,Fisika,NISN belum diisi")
	require.NotContains(t, text, "no_score")
	require.NotContains(t, text, "subject_not_published")

	xlsx, err := renderEraporXLSX(export)
	require.NoError(t, err)
	book, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer book.Close() //nolint:errcheck // read-only workbook in a test
	rows, err := book.GetRows("Dilewati")
	require.NoError(t, err)
	require.Equal(t, [][]string{
		{"Nama Siswa", "Mata Pelajaran", "Alasan Dilewati"},
		{"Siswa Dua Contoh", "Matematika", "Siswa belum punya nilai rapor"},
		{"Siswa Contoh", "Kimia", "Nilai mapel belum diterbitkan"},
		{"Siswa Tiga", "Fisika", "NISN belum diisi"},
	}, rows)
}
