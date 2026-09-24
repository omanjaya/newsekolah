package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// fakeAttendance is an in-memory AttendanceReader: one class's rows per
// classID, so a test can distinguish which class a Section came from.
type fakeAttendance struct {
	rows map[uuid.UUID][][]any
	err  error
}

func (f fakeAttendance) DailyReportTypedRows(_ context.Context, _ uuid.UUID, classID uuid.UUID, _ time.Time) ([][]any, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.rows[classID], nil
}

// fakeAcademic is an in-memory AcademicReader.
type fakeAcademic struct {
	byID       map[uuid.UUID]service.ClassRef
	byGradeLvl map[uuid.UUID][]service.ClassRef
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
	attendance := fakeAttendance{rows: map[uuid.UUID][][]any{
		classA: {{1, "Budi", "Hadir", 6, 6, "Yes"}},
		classB: {{1, "Wayan", "Hadir", 6, 5, "No"}},
	}}
	academic := fakeAcademic{
		byID: map[uuid.UUID]service.ClassRef{classA: {ID: classA, Name: "X-1"}, classB: {ID: classB, Name: "X-2"}},
		byGradeLvl: map[uuid.UUID][]service.ClassRef{
			gradeLevel: {{ID: classA, Name: "X-1"}, {ID: classB, Name: "X-2"}},
		},
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
	}, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})

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
	}, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})

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
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{Date: &date}, reportdoc.Options{})
	assert.ErrorIs(t, err, service.ErrMissingArgument)
}

func TestRunDocumentAttendanceDailyMissingDate(t *testing.T) {
	svc, classA, _, _ := newFixture(t)
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true},
	}, reportdoc.Options{})
	assert.ErrorIs(t, err, service.ErrMissingArgument)
}

func TestRunDocumentAttendanceDailyUnknownColumn(t *testing.T) {
	svc, classA, _, _ := newFixture(t)
	date := time.Now()
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true}, Date: &date,
	}, reportdoc.Options{Columns: []reportdoc.ColumnChoice{{Key: "nope"}}})

	var unknown *reportdoc.UnknownColumnError
	require.ErrorAs(t, err, &unknown)
	assert.Equal(t, "nope", unknown.Key)
}

func TestRunDocumentUnknownReportNotFound(t *testing.T) {
	svc, _, _, _ := newFixture(t)
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.Kind("bogus"), service.RunArgs{}, reportdoc.Options{})
	assert.ErrorIs(t, err, service.ErrReportNotFound)
}

// TestRunDocumentOtherKindsHonourFormat proves every catalogue kind, not
// only attendance.daily, renders through reportdoc and honours
// opts.Format -- permits.exit_permits_yearly here, picked because it
// takes no scope arguments at all.
func TestRunDocumentOtherKindsHonourFormat(t *testing.T) {
	permits := fakePermits{}
	svc := service.New(nil, nil, nil, permits)
	out, contentType, err := svc.RunDocument(context.Background(), uuid.New(), service.KindExitPermitsYearly, service.RunArgs{}, reportdoc.Options{Format: reportdoc.FormatPDF})
	require.NoError(t, err)
	assert.Equal(t, service.PDFContentType, contentType)
	assert.Equal(t, "%PDF", string(out[:4]))
}

func TestRunDocumentScopeConflict(t *testing.T) {
	svc, classA, _, gradeLevel := newFixture(t)
	date := time.Now()
	_, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		ClassID: uuid.NullUUID{UUID: classA, Valid: true}, GradeLevelID: uuid.NullUUID{UUID: gradeLevel, Valid: true}, Date: &date,
	}, reportdoc.Options{})
	assert.ErrorIs(t, err, service.ErrScopeConflict)
}

type fakePermits struct{}

func (fakePermits) LeaveRequestRows(context.Context, uuid.UUID, uuid.NullUUID, uuid.NullUUID) (reportdoc.Document, error) {
	return reportdoc.Document{}, nil
}

func (fakePermits) ExitPermitYearlyRows(context.Context, uuid.UUID) (reportdoc.Document, error) {
	return reportdoc.Document{
		Title:    "Exit Permits",
		Columns:  []reportdoc.Column{{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber}},
		Sections: []reportdoc.Section{{Rows: [][]any{{1}}}},
	}, nil
}
