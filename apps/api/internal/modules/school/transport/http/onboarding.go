package http

import (
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// ListLevelTemplates lists the SD/SMP/SMA/SMK starting points the
// onboarding wizard's first step can apply.
func (h *TenantHandler) ListLevelTemplates(_ context.Context, _ api.ListLevelTemplatesRequestObject) (api.ListLevelTemplatesResponseObject, error) {
	data := make([]api.LevelTemplateSummary, 0, len(service.AvailableLevelTemplates()))
	for _, key := range service.AvailableLevelTemplates() {
		tpl, err := domain.LevelTemplateByKey(string(key))
		if err != nil {
			continue
		}
		data = append(data, api.LevelTemplateSummary{
			Key:             api.LevelTemplateSummaryKey(tpl.Key),
			Name:            tpl.Name,
			GradeLevelCount: len(tpl.GradeLevels),
			SubjectCount:    len(tpl.Subjects),
			PeriodCount:     len(tpl.Periods),
		})
	}
	return api.ListLevelTemplates200JSONResponse{Data: data}, nil
}

// ApplyLevelTemplate creates every grade level, subject, and bell-schedule
// period the chosen template defines that the tenant does not already
// have.
func (h *TenantHandler) ApplyLevelTemplate(ctx context.Context, request api.ApplyLevelTemplateRequestObject) (api.ApplyLevelTemplateResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	report, err := h.service.ApplyLevelTemplate(ctx, tenantID, string(request.Body.Template))
	if err != nil {
		return nil, mapOnboardingError(err)
	}
	return api.ApplyLevelTemplate200JSONResponse(toAPITemplateReport(report)), nil
}

// PreviewDapodikImport parses an uploaded Dapodik CSV export and reports,
// per row, what would happen without writing anything.
func (h *TenantHandler) PreviewDapodikImport(ctx context.Context, request api.PreviewDapodikImportRequestObject) (api.PreviewDapodikImportResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	file, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, httpx.ErrValidation
	}
	rows, err := h.service.DapodikPreview(ctx, tenantID, file)
	if err != nil {
		return nil, mapOnboardingError(err)
	}
	return api.PreviewDapodikImport200JSONResponse{Data: toAPIDapodikRows(rows)}, nil
}

// CommitDapodikImport re-parses and re-evaluates the same file and applies
// every row that is not an error.
func (h *TenantHandler) CommitDapodikImport(ctx context.Context, request api.CommitDapodikImportRequestObject) (api.CommitDapodikImportResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	file, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, httpx.ErrValidation
	}
	rows, err := h.service.DapodikCommit(ctx, tenantID, actorID, file)
	if err != nil {
		return nil, mapOnboardingError(err)
	}
	return api.CommitDapodikImport200JSONResponse{Data: toAPIDapodikRows(rows)}, nil
}

// SeedSampleData fills a brand-new tenant with demo data, refusing once
// the tenant has any real data of its own.
func (h *TenantHandler) SeedSampleData(ctx context.Context, _ api.SeedSampleDataRequestObject) (api.SeedSampleDataResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	report, err := h.service.SeedSampleData(ctx, tenantID)
	if err != nil {
		return nil, mapOnboardingError(err)
	}
	return api.SeedSampleData200JSONResponse{
		AcademicYearLabel: report.AcademicYearLabel,
		ClassName:         report.ClassName,
		Template:          toAPITemplateReport(report.Template),
	}, nil
}

func toAPITemplateReport(report service.TemplateReport) api.LevelTemplateReport {
	items := make([]api.LevelTemplateItem, len(report.Items))
	for i, item := range report.Items {
		items[i] = api.LevelTemplateItem{
			Kind:   api.LevelTemplateItemKind(item.Kind),
			Code:   item.Code,
			Name:   item.Name,
			Status: api.LevelTemplateItemStatus(item.Status),
		}
	}
	return api.LevelTemplateReport{
		Template: api.LevelTemplateReportTemplate(report.Template),
		Items:    items,
		Created:  report.Created,
		Skipped:  report.Skipped,
	}
}

func toAPIDapodikRows(rows []service.DapodikRowResult) []api.DapodikImportRow {
	data := make([]api.DapodikImportRow, len(rows))
	for i, r := range rows {
		row := api.DapodikImportRow{RowNumber: r.RowNumber, Action: api.DapodikImportAction(r.Action)}
		if r.Name != "" {
			name := r.Name
			row.Name = &name
		}
		if r.NISN != "" {
			nisn := r.NISN
			row.Nisn = &nisn
		}
		if r.ClassName != "" {
			className := r.ClassName
			row.ClassName = &className
		}
		if len(r.Errors) > 0 {
			errs := r.Errors
			row.Errors = &errs
		}
		data[i] = row
	}
	return data
}

func mapOnboardingError(err error) error {
	switch {
	case errors.Is(err, domain.ErrUnknownLevelTemplate),
		errors.Is(err, domain.ErrDapodikEmptyFile):
		return httpx.ErrValidation
	case errors.Is(err, domain.ErrOnboardingUnavailable):
		return httpx.ErrInternal
	case errors.Is(err, domain.ErrTenantHasData):
		return httpx.NewError(http.StatusConflict, "TENANT_HAS_DATA")
	case errors.Is(err, domain.ErrNoActiveAcademicYear):
		return httpx.NewError(http.StatusConflict, "NO_ACTIVE_ACADEMIC_YEAR")
	}
	var missingColumns *domain.ErrDapodikMissingColumns
	if errors.As(err, &missingColumns) {
		return httpx.ErrValidation
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}
