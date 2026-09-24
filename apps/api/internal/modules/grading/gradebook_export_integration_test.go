package grading

import (
	"bytes"
	"context"
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
		}, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
		_, err = svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			SubjectID: fx.subjectID, TermID: term,
		}, defaultOpts)
		require.ErrorIs(t, err, domain.ErrInvalidScope)
	})

	t.Run("class scope renders one section with the class's own component and score", func(t *testing.T) {
		xlsx, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			ClassID: &classID, SubjectID: fx.subjectID, TermID: term,
		}, defaultOpts)
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
		}, reportdoc.Options{Format: reportdoc.FormatPDF})
		require.NoError(t, err)
		require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")))
	})

	t.Run("grade-level scope covers both classes, one section each", func(t *testing.T) {
		xlsx, err := svc.ExportGradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookExportQuery{
			GradeLevelID: &gradeLevelID, SubjectID: fx.subjectID, TermID: term,
		}, defaultOpts)
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
		}, reportdoc.Options{
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
