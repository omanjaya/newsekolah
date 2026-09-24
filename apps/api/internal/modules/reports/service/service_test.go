package service_test

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// fakeAttendance is an in-memory AttendanceReader: one class's rows per
// classID, so a test can distinguish which class a Section came from.
type fakeAttendance struct {
	rows   map[uuid.UUID][][]any
	labels map[string]string
	err    error
}

func (f fakeAttendance) DailyReportRows(context.Context, uuid.UUID, uuid.UUID, time.Time) (service.Sheet, error) {
	return service.Sheet{}, errors.New("not used by these tests")
}

func (f fakeAttendance) DailyReportTypedRows(_ context.Context, _ uuid.UUID, classID uuid.UUID, _ time.Time) ([][]any, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.rows[classID], nil
}

func (f fakeAttendance) StatusLabels(context.Context, uuid.UUID) (map[string]string, error) {
	return f.labels, nil
}

// fakeAcademic is an in-memory AcademicReader.
type fakeAcademic struct {
	byID        map[uuid.UUID]service.ClassRef
	byGradeLvl  map[uuid.UUID][]service.ClassRef
	gradeLevels map[uuid.UUID]string
}

func (f fakeAcademic) ClassByID(_ context.Context, _ uuid.UUID, classID uuid.UUID) (service.ClassRef, error) {
	c, ok := f.byID[classID]
	if !ok {
		return service.ClassRef{}, errors.New("class not found")
	}
	return c, nil
}

func (f fakeAcademic) ClassesInGradeLevel(_ context.Context, _ uuid.UUID, gradeLevelID uuid.UUID) ([]service.ClassRef, error) {
	return f.byGradeLvl[gradeLevelID], nil
}

func (f fakeAcademic) GradeLevelName(_ context.Context, _ uuid.UUID, gradeLevelID uuid.UUID) (string, error) {
	name, ok := f.gradeLevels[gradeLevelID]
	if !ok {
		return "", errors.New("grade level not found")
	}
	return name, nil
}

// fakeLetterhead is an in-memory reportdoc.LetterheadSource.
type fakeLetterhead struct {
	lh  *reportdoc.Letterhead
	sig *reportdoc.Signature
}

func (f fakeLetterhead) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return f.lh, f.sig, nil
}

func newFixture(t *testing.T) (*service.Service, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	classA, classB, gradeLevel := uuid.New(), uuid.New(), uuid.New()
	attendance := fakeAttendance{
		rows: map[uuid.UUID][][]any{
			classA: {{1, "Budi", "H", 6, 6, true}},
			classB: {{1, "Wayan", "INCOMPLETE", 6, 5, false}},
		},
		labels: map[string]string{"H": "Hadir", "S": "Sakit"},
	}
	academic := fakeAcademic{
		byID: map[uuid.UUID]service.ClassRef{classA: {ID: classA, Name: "X-1"}, classB: {ID: classB, Name: "X-2"}},
		byGradeLvl: map[uuid.UUID][]service.ClassRef{
			gradeLevel: {{ID: classA, Name: "X-1"}, {ID: classB, Name: "X-2"}},
		},
		gradeLevels: map[uuid.UUID]string{gradeLevel: "Kelas X"},
	}
	svc := service.New(attendance, nil, nil, nil)
	svc.SetReportDocDependencies(academic, fakeLetterhead{
		lh:  &reportdoc.Letterhead{Lines: []string{"SMA Negeri 1"}},
		sig: &reportdoc.Signature{Place: "Denpasar", Signers: []reportdoc.Signer{{RoleLabel: "Kepala Sekolah", Name: "Budi"}}},
	})
	return svc, classA, classB, gradeLevel
}

func TestRunDocumentAttendanceDailySingleClassXLSX(t *testing.T) {
	svc, classA, _, _ := newFixture(t)
	date := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)

	out, contentType, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true}, Date: &date,
	}, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}, reportdoc.LocaleID)

	require.NoError(t, err)
	assert.Equal(t, service.XLSXContentType, contentType)
	require.NotEmpty(t, out)
	assert.Equal(t, "PK", string(out[:2])) // xlsx is a zip archive
}

func TestRunDocumentAttendanceDailyGradeLevelPDFMultiSection(t *testing.T) {
	svc, _, _, gradeLevel := newFixture(t)
	date := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)

	out, contentType, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		GradeLevelID: uuid.NullUUID{UUID: gradeLevel, Valid: true}, Date: &date,
	}, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true}, reportdoc.LocaleID)

	require.NoError(t, err)
	assert.Equal(t, service.PDFContentType, contentType)
	require.NotEmpty(t, out)
	assert.Equal(t, "%PDF", string(out[:4]))
	// One /Type /Page object per class in the grade level (2 classes).
	count := 0
	for i := 0; i+len("/Type /Page\n") <= len(out); i++ {
		if string(out[i:i+len("/Type /Page\n")]) == "/Type /Page\n" {
			count++
		}
	}
	assert.Equal(t, 2, count)
}

func TestRunDocumentAttendanceDailyMissingScope(t *testing.T) {
	svc, _, _, _ := newFixture(t)
	date := time.Now()
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{Date: &date}, reportdoc.Options{}, reportdoc.LocaleID)
	assert.ErrorIs(t, err, service.ErrMissingArgument)
}

func TestRunDocumentAttendanceDailyMissingDate(t *testing.T) {
	svc, classA, _, _ := newFixture(t)
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true},
	}, reportdoc.Options{}, reportdoc.LocaleID)
	assert.ErrorIs(t, err, service.ErrMissingArgument)
}

func TestRunDocumentAttendanceDailyUnknownColumn(t *testing.T) {
	svc, classA, _, _ := newFixture(t)
	date := time.Now()
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true}, Date: &date,
	}, reportdoc.Options{Columns: []reportdoc.ColumnChoice{{Key: "nope"}}}, reportdoc.LocaleID)

	var unknown *reportdoc.UnknownColumnError
	require.ErrorAs(t, err, &unknown)
	assert.Equal(t, "nope", unknown.Key)
}

func TestRunDocumentUnknownReportNotFound(t *testing.T) {
	svc, _, _, _ := newFixture(t)
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.Kind("bogus"), service.RunArgs{}, reportdoc.Options{}, reportdoc.LocaleID)
	assert.ErrorIs(t, err, service.ErrReportNotFound)
}

// TestRunDocumentOtherKindsUnaffected proves a non-attendance.daily kind
// still returns plain XLSX via the legacy Run path regardless of
// opts.Format, so migrating attendance.daily onto reportdoc never changes
// another report's behaviour.
func TestRunDocumentOtherKindsUnaffected(t *testing.T) {
	permits := fakePermits{}
	svc := service.New(nil, nil, nil, permits)
	out, contentType, err := svc.RunDocument(context.Background(), uuid.New(), service.KindExitPermitsYearly, service.RunArgs{}, reportdoc.Options{Format: reportdoc.FormatPDF}, reportdoc.LocaleID)
	require.NoError(t, err)
	assert.Equal(t, service.XLSXContentType, contentType, "unmigrated kinds ignore opts.Format and always return XLSX")
	assert.Equal(t, "PK", string(out[:2]))
}

// TestRunDocumentLocalizesLabelsAndValues is the regression test for the
// coordinator's rendered-PDF review: everything user-facing must be in
// the tenant's locale -- title, scope labels/values (grade level name,
// Indonesian date), column labels, the tenant's own status label, the
// special "INCOMPLETE" code, and the complete flag.
func TestRunDocumentLocalizesLabelsAndValues(t *testing.T) {
	svc, _, _, gradeLevel := newFixture(t)
	date := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)

	out, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		GradeLevelID: uuid.NullUUID{UUID: gradeLevel, Valid: true}, Date: &date,
	}, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}, reportdoc.LocaleID)
	require.NoError(t, err)

	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	sheets := f.GetSheetList()
	require.Len(t, sheets, 2)

	// Row layout for this fixture: 1 letterhead line (row 1), title (row
	// 2), section name -- the class name, distinct from the title --
	// (row 3), 2 scope lines (rows 4-5), 1 blank separator (row 6), so
	// the header row is row 7 and the first data row is row 8.
	title, err := f.GetCellValue(sheets[0], "A2")
	require.NoError(t, err)
	assert.Equal(t, "Presensi Harian", title)
	scopeGradeLevel, err := f.GetCellValue(sheets[0], "A4")
	require.NoError(t, err)
	assert.Equal(t, "Angkatan: Kelas X", scopeGradeLevel)
	scopeDate, err := f.GetCellValue(sheets[0], "A5")
	require.NoError(t, err)
	assert.Equal(t, "Tanggal: 2 September 2026", scopeDate)

	nameHeader, err := f.GetCellValue(sheets[0], "B7")
	require.NoError(t, err)
	assert.Equal(t, "Nama", nameHeader)
	expectedHeader, err := f.GetCellValue(sheets[0], "D7")
	require.NoError(t, err)
	assert.Equal(t, "Jumlah Sesi Diharapkan", expectedHeader)

	// Class X-1's student has status code "H" with a tenant label
	// "Hadir" and complete=true -> "Ya".
	status, err := f.GetCellValue(sheets[0], "C8")
	require.NoError(t, err)
	assert.Equal(t, "Hadir", status)
	complete, err := f.GetCellValue(sheets[0], "F8")
	require.NoError(t, err)
	assert.Equal(t, "Ya", complete)

	// Class X-2's student has the special "INCOMPLETE" code (no tenant
	// label) and complete=false -> "Belum Lengkap" / "Tidak".
	status2, err := f.GetCellValue(sheets[1], "C8")
	require.NoError(t, err)
	assert.Equal(t, "Belum Lengkap", status2)
	complete2, err := f.GetCellValue(sheets[1], "F8")
	require.NoError(t, err)
	assert.Equal(t, "Tidak", complete2)
}

// TestRunDocumentEnglishLocale proves the same export in English uses
// English title/column/scope text instead of Indonesian.
func TestRunDocumentEnglishLocale(t *testing.T) {
	svc, classA, _, _ := newFixture(t)
	date := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)

	out, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true}, Date: &date,
	}, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}, reportdoc.LocaleEN)
	require.NoError(t, err)

	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer f.Close()
	sheet := f.GetSheetList()[0]

	title, err := f.GetCellValue(sheet, "A2")
	require.NoError(t, err)
	assert.Equal(t, "Attendance Daily Report", title)
	// Row 3 is the section name (class "X-1"), row 4 the "Class: X-1"
	// scope line, row 5 the date -- see the row-layout comment in
	// TestRunDocumentLocalizesLabelsAndValues.
	scopeClass, err := f.GetCellValue(sheet, "A4")
	require.NoError(t, err)
	assert.Equal(t, "Class: X-1", scopeClass)
	scopeDate, err := f.GetCellValue(sheet, "A5")
	require.NoError(t, err)
	assert.Equal(t, "Date: September 2, 2026", scopeDate)
}

type fakePermits struct{}

func (fakePermits) LeaveRequestRows(context.Context, uuid.UUID, uuid.NullUUID) (service.Sheet, error) {
	return service.Sheet{}, nil
}

func (fakePermits) ExitPermitYearlyRows(context.Context, uuid.UUID) (service.Sheet, error) {
	return service.Sheet{Title: "Exit Permits", Headers: []string{"No"}}, nil
}
