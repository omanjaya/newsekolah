package grading

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestExportGradebookGradeLevelScope covers the new gradebook export
// (NOT the e-Rapor export, a separate surface): the class and grade-level
// ("angkatan") scopes, using the exact same data Service.Gradebook
// assembles for the on-screen sheet.
func TestExportGradebookGradeLevelScope(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	class2ID, student2ID := seedSecondClass(t, pg.AdminPool, fx)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	svc := gradingModule.Service

	term := uuid.NullUUID{UUID: fx.termID, Valid: true}
	component, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term, Code: "UH1", Kind: domain.KindFormative, Weight: 1,
	})
	require.NoError(t, err)
	score := 88.0
	_, err = svc.SaveScores(ctx, fx.tenantID, component.ID, fx.teacherID, true, []service.ScoreEntry{
		{StudentUserID: fx.studentID, Score: &score},
	})
	require.NoError(t, err)

	component2, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: class2ID, SubjectID: fx.subjectID, TermID: term, Code: "UH1", Kind: domain.KindFormative, Weight: 1,
	})
	require.NoError(t, err)
	score2 := 72.0
	_, err = svc.SaveScores(ctx, fx.tenantID, component2.ID, fx.teacherID, true, []service.ScoreEntry{
		{StudentUserID: student2ID, Score: &score2},
	})
	require.NoError(t, err)

	classID, gradeLevelID := fx.classID, fx.gradeLevelID
	defaultOpts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}

	t.Run("exactly one of class_id/grade_level_id is required", func(t *testing.T) {
		_, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			ClassID: &classID, GradeLevelID: &gradeLevelID, SubjectID: fx.subjectID, TermID: term,
		}, reportdoc.LocaleID, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			SubjectID: fx.subjectID, TermID: term,
		}, reportdoc.LocaleID, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
	})

	t.Run("class scope renders one section with the class's own component and score", func(t *testing.T) {
		xlsx, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			ClassID: &classID, SubjectID: fx.subjectID, TermID: term,
		}, reportdoc.LocaleID, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.Len(t, f.GetSheetList(), 1)
		rows, err := f.GetRows(f.GetSheetList()[0])
		require.NoError(t, err)
		var flat []string
		for _, row := range rows {
			flat = append(flat, row...)
		}
		require.Contains(t, flat, "Siswa Baru")
		require.Contains(t, flat, "UH1")
		require.Contains(t, flat, "88")

		pdf, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			ClassID: &classID, SubjectID: fx.subjectID, TermID: term,
		}, reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatPDF})
		require.NoError(t, err)
		require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")))
	})

	t.Run("grade-level scope covers both classes, one section each", func(t *testing.T) {
		xlsx, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			GradeLevelID: &gradeLevelID, SubjectID: fx.subjectID, TermID: term,
		}, reportdoc.LocaleID, defaultOpts)
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(xlsx))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		require.ElementsMatch(t, []string{"X-A", "X-B"}, f.GetSheetList())

		aRows, err := f.GetRows("X-A")
		require.NoError(t, err)
		var aFlat []string
		for _, row := range aRows {
			aFlat = append(aFlat, row...)
		}
		require.Contains(t, aFlat, "Siswa Baru")
		require.NotContains(t, aFlat, "Siswa Dua")

		bRows, err := f.GetRows("X-B")
		require.NoError(t, err)
		var bFlat []string
		for _, row := range bRows {
			bFlat = append(bFlat, row...)
		}
		require.Contains(t, bFlat, "Siswa Dua")
		require.Contains(t, bFlat, "72")
	})

	t.Run("a caller-chosen column subset is honoured", func(t *testing.T) {
		narrowed, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			ClassID: &classID, SubjectID: fx.subjectID, TermID: term,
		}, reportdoc.LocaleID, reportdoc.Options{
			Format: reportdoc.FormatXLSX,
			Columns: []reportdoc.ColumnChoice{
				{Key: "name", Label: "Nama"},
				{Key: "average"},
			},
		})
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(narrowed))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		rows, err := f.GetRows(f.GetSheetList()[0])
		require.NoError(t, err)
		require.Contains(t, rows, []string{"Nama", "Rata-rata"})
	})
}

// fakeGradebookLetterheadSource is a minimal reportdoc.LetterheadSource
// stub, for verifying the gradebook export wires in whatever the school
// module's ReportLetterhead would have returned, without depending on
// that module's own tenant_settings fixture.
type fakeGradebookLetterheadSource struct {
	signature *reportdoc.Signature
}

func (f fakeGradebookLetterheadSource) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return nil, f.signature, nil
}

// TestExportGradebookHomeroomTeacherSigner covers the gradebook export's
// two-signer signature block: a single-class scope prepends the class's
// currently assigned homeroom teacher as "Wali Kelas" ahead of the
// tenant's own default signer(s); a grade-level scope spanning multiple
// classes cannot attribute one class's homeroom teacher and keeps the
// tenant default only.
func TestExportGradebookHomeroomTeacherSigner(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	// A second class in the same grade level, so the grade-level-scoped
	// assertion below actually covers two classes -- a grade level with
	// only one class would otherwise legitimately get that one class's
	// homeroom teacher too, defeating the point of this assertion.
	seedSecondClass(t, pg.AdminPool, fx)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	svc := gradingModule.Service
	svc.SetLetterheadSource(fakeGradebookLetterheadSource{
		signature: &reportdoc.Signature{
			Place:   "Denpasar",
			Signers: []reportdoc.Signer{{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta"}},
		},
	})

	_, err := pg.AdminPool.Exec(ctx, `update classes set homeroom_teacher_id = $1 where tenant_id = $2 and id = $3`, fx.teacherID, fx.tenantID, fx.classID)
	require.NoError(t, err)

	term := uuid.NullUUID{UUID: fx.termID, Valid: true}
	classID, gradeLevelID := fx.classID, fx.gradeLevelID
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}

	classScoped, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
		ClassID: &classID, SubjectID: fx.subjectID, TermID: term,
	}, reportdoc.LocaleID, opts)
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(classScoped))
	require.NoError(t, err)
	defer f.Close() //nolint:errcheck
	rows, err := f.GetRows(f.GetSheetList()[0])
	require.NoError(t, err)
	var flat []string
	for _, row := range rows {
		flat = append(flat, row...)
	}
	joined := strings.Join(flat, " | ")
	require.Contains(t, joined, "Wali Kelas")
	require.Contains(t, joined, "Guru Test", "the class's homeroom teacher must be resolved and rendered")
	require.Contains(t, joined, "I Wayan Arta")

	gradeLevelScoped, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
		GradeLevelID: &gradeLevelID, SubjectID: fx.subjectID, TermID: term,
	}, reportdoc.LocaleID, opts)
	require.NoError(t, err)
	gf, err := excelize.OpenReader(bytes.NewReader(gradeLevelScoped))
	require.NoError(t, err)
	defer gf.Close() //nolint:errcheck
	var gFlat []string
	for _, sheet := range gf.GetSheetList() {
		grows, err := gf.GetRows(sheet)
		require.NoError(t, err)
		for _, row := range grows {
			gFlat = append(gFlat, row...)
		}
	}
	require.NotContains(t, strings.Join(gFlat, " | "), "Wali Kelas", "a grade-level export spans multiple classes and cannot attribute one class's homeroom teacher")
}
