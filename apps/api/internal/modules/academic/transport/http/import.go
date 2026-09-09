package http

import (
	"bytes"
	"context"
	"io"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *AcademicHandler) DownloadEnrollmentImportTemplate(_ context.Context, _ api.DownloadEnrollmentImportTemplateRequestObject) (api.DownloadEnrollmentImportTemplateResponseObject, error) {
	file, err := h.service.ImportTemplate()
	if err != nil {
		return nil, httpx.ErrInternal
	}
	return api.DownloadEnrollmentImportTemplate200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(file), ContentLength: int64(len(file)),
	}, nil
}

func (h *AcademicHandler) PreviewEnrollmentImport(ctx context.Context, request api.PreviewEnrollmentImportRequestObject) (api.PreviewEnrollmentImportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	file, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, httpx.ErrValidation
	}
	rows, err := h.service.ImportPreview(ctx, tenantID, request.Params.AcademicYearId, file)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.PreviewEnrollmentImport200JSONResponse{Data: toAPIImportRows(rows)}, nil
}

func (h *AcademicHandler) CommitEnrollmentImport(ctx context.Context, request api.CommitEnrollmentImportRequestObject) (api.CommitEnrollmentImportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	file, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, httpx.ErrValidation
	}
	rows, err := h.service.ImportCommit(ctx, tenantID, request.Params.AcademicYearId, file, h.clock.Now())
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CommitEnrollmentImport200JSONResponse{Data: toAPIImportRows(rows)}, nil
}

func toAPIImportRows(rows []service.ImportRowResult) []api.ImportRowResult {
	data := make([]api.ImportRowResult, len(rows))
	for i, r := range rows {
		row := api.ImportRowResult{RowNumber: r.RowNumber, Action: api.ImportRowAction(r.Action)}
		if r.NIS != "" {
			nis := r.NIS
			row.Nis = &nis
		}
		if r.Username != "" {
			username := r.Username
			row.Username = &username
		}
		if r.ClassName != "" {
			className := r.ClassName
			row.ClassName = &className
		}
		if r.StudentName != "" {
			studentName := r.StudentName
			row.StudentName = &studentName
		}
		if r.Message != "" {
			message := r.Message
			row.Message = &message
		}
		data[i] = row
	}
	return data
}
