package http

import (
	"bytes"
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func (h *LibraryHandler) GetLibraryImportTemplateXlsx(ctx context.Context, _ api.GetLibraryImportTemplateXlsxRequestObject) (api.GetLibraryImportTemplateXlsxResponseObject, error) {
	xlsx, err := h.service.ImportTemplateXLSX(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryImportTemplateXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

// toRawRows converts the strict-typed request body's rows into the plain
// map[string]any shape the service/domain import functions work with, so
// this transport package is the only place that knows about the
// generated api.LibraryImportRow type.
func toRawRows(rows []api.LibraryImportRow) []map[string]any {
	out := make([]map[string]any, len(rows))
	for i, r := range rows {
		out[i] = r
	}
	return out
}

func (h *LibraryHandler) PreviewLibraryImport(ctx context.Context, request api.PreviewLibraryImportRequestObject) (api.PreviewLibraryImportResponseObject, error) {
	if request.Body == nil {
		return nil, mapError(domain.ErrInvalidInput)
	}
	var mapping map[string]string
	if request.Body.Mapping != nil {
		mapping = *request.Body.Mapping
	}
	preview, err := h.service.PreviewImport(ctx, tenantID(ctx), toRawRows(request.Body.Rows), mapping)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PreviewLibraryImport200JSONResponse(toAPIImportPreview(preview)), nil
}

func (h *LibraryHandler) CommitLibraryImport(ctx context.Context, request api.CommitLibraryImportRequestObject) (api.CommitLibraryImportResponseObject, error) {
	if request.Body == nil {
		return nil, mapError(domain.ErrInvalidInput)
	}
	var mapping map[string]string
	if request.Body.Mapping != nil {
		mapping = *request.Body.Mapping
	}
	result, err := h.service.CommitImport(ctx, tenantID(ctx), toRawRows(request.Body.Rows), mapping)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CommitLibraryImport200JSONResponse{CreatedTitles: result.CreatedTitles, CreatedCopies: result.CreatedCopies}, nil
}

func toAPIImportPreview(p service.ImportPreview) api.LibraryImportPreview {
	rows := make([]api.LibraryImportPreviewRow, len(p.Rows))
	for i, r := range p.Rows {
		rows[i] = api.LibraryImportPreviewRow{
			RowNumber: r.RowNumber, Status: api.LibraryImportPreviewRowStatus(r.Status), Message: r.Message,
			Title: r.Title, Copies: r.Copies,
		}
	}
	out := api.LibraryImportPreview{Rows: rows}
	out.Summary.NewTitles = p.Summary.NewTitles
	out.Summary.ExistingTitles = p.Summary.ExistingTitles
	out.Summary.Copies = p.Summary.Copies
	out.Summary.Errors = p.Summary.Errors
	return out
}
