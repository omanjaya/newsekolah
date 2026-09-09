package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

// newTemplateTestService builds a Service with only the academic
// collaborator wired, which is all applyGradeLevels/applySubjects/
// applyPeriods touch -- they never open a transaction themselves (their
// caller, ApplyLevelTemplate, does), so no database pool is needed to
// exercise them directly.
func newTemplateTestService(academic AcademicPort) *Service {
	return &Service{academic: academic}
}

func TestApplyGradeLevels_IsIdempotent(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	academic := newFakeAcademic()
	svc := newTemplateTestService(academic)
	tpl, err := domain.LevelTemplateByKey("smp")
	require.NoError(t, err)

	var first TemplateReport
	require.NoError(t, svc.applyGradeLevels(ctx, tenantID, tpl, &first))
	require.Equal(t, len(tpl.GradeLevels), first.Created)
	require.Equal(t, 0, first.Skipped)

	var second TemplateReport
	require.NoError(t, svc.applyGradeLevels(ctx, tenantID, tpl, &second))
	require.Equal(t, 0, second.Created)
	require.Equal(t, len(tpl.GradeLevels), second.Skipped)

	require.Len(t, academic.gradeLevels, len(tpl.GradeLevels), "re-applying must not duplicate rows")
}

func TestApplySubjects_IsIdempotent(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	academic := newFakeAcademic()
	svc := newTemplateTestService(academic)
	tpl, err := domain.LevelTemplateByKey("sd")
	require.NoError(t, err)

	var first TemplateReport
	require.NoError(t, svc.applySubjects(ctx, tenantID, tpl, &first))
	require.Equal(t, len(tpl.Subjects), first.Created)

	var second TemplateReport
	require.NoError(t, svc.applySubjects(ctx, tenantID, tpl, &second))
	require.Equal(t, 0, second.Created)
	require.Equal(t, len(tpl.Subjects), second.Skipped)

	require.Len(t, academic.subjects, len(tpl.Subjects))
}

func TestApplySubjects_PartialOverlapOnlyFillsGaps(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	academic := newFakeAcademic()
	svc := newTemplateTestService(academic)
	tpl, err := domain.LevelTemplateByKey("sma")
	require.NoError(t, err)

	// The tenant already added its own "MTK" row (a different school might
	// have set this up by hand before ever touching the wizard) -- the
	// template must recognize it by code and skip it, not fail or
	// duplicate.
	_, err = academic.CreateSubject(ctx, tenantID, tpl.Subjects[0].Code, "Existing name kept as-is")
	require.NoError(t, err)

	var report TemplateReport
	require.NoError(t, svc.applySubjects(ctx, tenantID, tpl, &report))
	require.Equal(t, len(tpl.Subjects)-1, report.Created)
	require.Equal(t, 1, report.Skipped)
	require.Len(t, academic.subjects, len(tpl.Subjects))
}

func TestApplyPeriods_IsIdempotentAndReusesOneTemplate(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	academic := newFakeAcademic()
	svc := newTemplateTestService(academic)
	tpl, err := domain.LevelTemplateByKey("sma")
	require.NoError(t, err)

	var first TemplateReport
	require.NoError(t, svc.applyPeriods(ctx, tenantID, tpl, &first))
	require.Equal(t, len(tpl.Periods), first.Created)
	require.Len(t, academic.periodTemplates, 1, "must create exactly one period template, not one per period")

	var second TemplateReport
	require.NoError(t, svc.applyPeriods(ctx, tenantID, tpl, &second))
	require.Equal(t, 0, second.Created)
	require.Equal(t, len(tpl.Periods), second.Skipped)
	require.Len(t, academic.periodTemplates, 1, "re-applying must not create a second period template")
}

func TestApplyLevelTemplate_UnknownKey(t *testing.T) {
	svc := newTemplateTestService(newFakeAcademic())
	_, err := svc.ApplyLevelTemplate(context.Background(), uuid.New(), "college")
	require.ErrorIs(t, err, domain.ErrUnknownLevelTemplate)
}

func TestApplyLevelTemplate_UnavailableWithoutAcademicPort(t *testing.T) {
	svc := &Service{}
	_, err := svc.ApplyLevelTemplate(context.Background(), uuid.New(), "sd")
	require.ErrorIs(t, err, domain.ErrOnboardingUnavailable)
}
