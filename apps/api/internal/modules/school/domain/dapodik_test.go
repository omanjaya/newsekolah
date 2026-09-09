package domain

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

const validDapodikCSV = `nama,nisn,nipd,jenis_kelamin,tempat_lahir,tanggal_lahir,rombel saat ini
Siti Aminah,0051234567,2024001,P,Jakarta,17-08-2012,7A
Budi Santoso,0051234568,2024002,L,Bandung,01-01-2012,7A
`

func TestParseDapodikCSV_ValidFile(t *testing.T) {
	rows, err := ParseDapodikCSV(strings.NewReader(validDapodikCSV))
	require.NoError(t, err)
	require.Len(t, rows, 2)

	require.Equal(t, DapodikRow{
		RowNumber: 2, Name: "Siti Aminah", NISN: "0051234567", NIPD: "2024001",
		GenderRaw: "P", BirthPlace: "Jakarta", BirthDateRaw: "17-08-2012", ClassName: "7A",
	}, rows[0])

	gender, ok := rows[0].Gender()
	require.True(t, ok)
	require.Equal(t, "female", gender)

	gender, ok = rows[1].Gender()
	require.True(t, ok)
	require.Equal(t, "male", gender)

	birthDate, err := rows[0].BirthDate()
	require.NoError(t, err)
	require.Equal(t, 2012, birthDate.Year())
	require.Equal(t, 8, int(birthDate.Month()))
	require.Equal(t, 17, birthDate.Day())
}

func TestParseDapodikCSV_ColumnOrderDoesNotMatter(t *testing.T) {
	csv := "rombel saat ini,nama,jenis_kelamin,nisn,nipd,tempat_lahir,tanggal_lahir\n" +
		"7A,Siti Aminah,P,0051234567,2024001,Jakarta,17-08-2012\n"
	rows, err := ParseDapodikCSV(strings.NewReader(csv))
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "Siti Aminah", rows[0].Name)
	require.Equal(t, "0051234567", rows[0].NISN)
	require.Equal(t, "7A", rows[0].ClassName)
}

func TestParseDapodikCSV_HeaderIsCaseInsensitive(t *testing.T) {
	csv := "NAMA,NISN,NIPD,JENIS_KELAMIN,TEMPAT_LAHIR,TANGGAL_LAHIR,ROMBEL SAAT INI\n" +
		"Siti Aminah,0051234567,2024001,P,Jakarta,17-08-2012,7A\n"
	rows, err := ParseDapodikCSV(strings.NewReader(csv))
	require.NoError(t, err)
	require.Len(t, rows, 1)
}

func TestParseDapodikCSV_SkipsBlankRows(t *testing.T) {
	csv := validDapodikCSV + "\n,,,,,,\n"
	rows, err := ParseDapodikCSV(strings.NewReader(csv))
	require.NoError(t, err)
	require.Len(t, rows, 2)
}

func TestParseDapodikCSV_MissingColumns(t *testing.T) {
	csv := "nama,nisn\nSiti Aminah,0051234567\n"
	_, err := ParseDapodikCSV(strings.NewReader(csv))
	require.Error(t, err)

	var missing *ErrDapodikMissingColumns
	require.ErrorAs(t, err, &missing)
	require.Contains(t, missing.Columns, "jenis_kelamin")
	require.Contains(t, missing.Columns, "rombel saat ini")
}

func TestParseDapodikCSV_EmptyFile(t *testing.T) {
	_, err := ParseDapodikCSV(strings.NewReader(""))
	require.ErrorIs(t, err, ErrDapodikEmptyFile)
}

func TestParseDapodikCSV_HeaderOnlyIsEmpty(t *testing.T) {
	csv := "nama,nisn,nipd,jenis_kelamin,tempat_lahir,tanggal_lahir,rombel saat ini\n"
	_, err := ParseDapodikCSV(strings.NewReader(csv))
	require.ErrorIs(t, err, ErrDapodikEmptyFile)
}

func TestDapodikRow_Validate(t *testing.T) {
	tests := []struct {
		name     string
		row      DapodikRow
		wantErrs []string
	}{
		{
			name: "valid row",
			row: DapodikRow{
				Name: "Siti Aminah", NISN: "0051234567", GenderRaw: "P",
				BirthDateRaw: "17-08-2012", ClassName: "7A",
			},
			wantErrs: nil,
		},
		{
			name:     "missing everything",
			row:      DapodikRow{},
			wantErrs: []string{"nama is required", "nisn is required", "jenis_kelamin must be L or P", "rombel saat ini is required"},
		},
		{
			name: "invalid gender code",
			row: DapodikRow{
				Name: "Siti Aminah", NISN: "0051234567", GenderRaw: "X",
				ClassName: "7A",
			},
			wantErrs: []string{"jenis_kelamin must be L or P"},
		},
		{
			name: "unparseable birth date",
			row: DapodikRow{
				Name: "Siti Aminah", NISN: "0051234567", GenderRaw: "P",
				BirthDateRaw: "2012-08-17", ClassName: "7A",
			},
			wantErrs: []string{"tanggal_lahir must be dd-mm-yyyy"},
		},
		{
			name: "blank birth date is not an error",
			row: DapodikRow{
				Name: "Siti Aminah", NISN: "0051234567", GenderRaw: "L",
				ClassName: "7A",
			},
			wantErrs: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.wantErrs, tt.row.Validate())
		})
	}
}
