package http

import (
	"bytes"
	"context"
	"errors"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func mapReportHeaderError(err error) error {
	switch {
	case errors.Is(err, domain.ErrReportHeaderTooManyLines),
		errors.Is(err, domain.ErrReportHeaderLineTooLong),
		errors.Is(err, domain.ErrReportHeaderTooManySigners),
		errors.Is(err, domain.ErrReportHeaderPlaceTooLong),
		errors.Is(err, domain.ErrReportHeaderSignerInvalid):
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "report_header", Code: "INVALID"})
	case errors.Is(err, domain.ErrTenantNotFound):
		return httpx.ErrTenantNotFound
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func (h *TenantHandler) GetTenantReportHeader(ctx context.Context, _ api.GetTenantReportHeaderRequestObject) (api.GetTenantReportHeaderResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	header, err := h.service.ReportHeader(ctx, tenantID)
	if err != nil {
		return nil, mapReportHeaderError(err)
	}
	return api.GetTenantReportHeader200JSONResponse(toAPIReportHeader(header)), nil
}

func (h *TenantHandler) UpdateTenantReportHeader(ctx context.Context, request api.UpdateTenantReportHeaderRequestObject) (api.UpdateTenantReportHeaderResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	header, err := h.service.UpdateReportHeader(ctx, tenantID, actorID, fromAPIReportHeaderWrite(*request.Body))
	if err != nil {
		return nil, mapReportHeaderError(err)
	}
	return api.UpdateTenantReportHeader200JSONResponse(toAPIReportHeader(header)), nil
}

// PreviewTenantReportHeader renders a small sample attendance-style
// report with the tenant's currently saved report header, so the
// settings page can show what a real export will look like without
// running a real report.
func (h *TenantHandler) PreviewTenantReportHeader(ctx context.Context, request api.PreviewTenantReportHeaderRequestObject) (api.PreviewTenantReportHeaderResponseObject, error) {
	tenantID, _ := httpx.TenantIDFromContext(ctx)
	lh, sig, err := h.service.ReportLetterhead(ctx, tenantID)
	if err != nil {
		return nil, mapReportHeaderError(err)
	}
	if sig != nil {
		sig.Date = time.Now().Format("2006-01-02")
	}
	doc := previewDocument(lh, sig)

	switch request.Params.Format {
	case api.PreviewTenantReportHeaderParamsFormatPdf:
		out, err := reportdoc.RenderPDF(doc)
		if err != nil {
			return nil, httpx.Internal(err)
		}
		return api.PreviewTenantReportHeader200ApplicationpdfResponse{Body: bytes.NewReader(out), ContentLength: int64(len(out))}, nil
	default:
		out, err := reportdoc.RenderXLSX(doc)
		if err != nil {
			return nil, httpx.Internal(err)
		}
		return api.PreviewTenantReportHeader200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
			Body: bytes.NewReader(out), ContentLength: int64(len(out)),
		}, nil
	}
}

// previewDocument is a small, fixed sample -- the settings page's live
// preview is about the letterhead/signature, not about any real report's
// data, so three placeholder rows are enough to show the layout.
func previewDocument(lh *reportdoc.Letterhead, sig *reportdoc.Signature) reportdoc.Document {
	return reportdoc.Document{
		Letterhead: lh,
		Title:      "Contoh Laporan",
		Scope:      []reportdoc.ScopeLine{{Label: "Kelas", Value: "X-1"}, {Label: "Periode", Value: time.Now().Format("2006-01-02")}},
		Columns: []reportdoc.Column{
			{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 5},
			{Key: "name", Label: "Nama", Kind: reportdoc.ColumnText, Width: 28},
			{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 14},
		},
		Sections: []reportdoc.Section{{
			Name: "X-1",
			Rows: [][]any{
				{1, "Budi Santoso", "Hadir"},
				{2, "Siti Aminah", "Sakit"},
				{3, "Wayan Putra", "Hadir"},
			},
		}},
		Signature:       sig,
		PageLabelFormat: "Halaman {page} dari {pages}",
	}
}

func toAPIReportHeader(h domain.ReportHeader) api.ReportHeader {
	signers := make([]api.ReportHeaderSigner, len(h.Signers))
	for i, s := range h.Signers {
		signers[i] = api.ReportHeaderSigner{RoleLabel: s.RoleLabel, Name: s.Name}
		if s.IDLabel != "" {
			idLabel := s.IDLabel
			signers[i].IdLabel = &idLabel
		}
		if s.IDNumber != "" {
			idNumber := s.IDNumber
			signers[i].IdNumber = &idNumber
		}
	}
	lines := h.Lines
	if lines == nil {
		lines = []string{}
	}
	return api.ReportHeader{ShowLogo: h.ShowLogo, Lines: lines, Place: h.Place, Signers: signers}
}

func fromAPIReportHeaderWrite(w api.ReportHeaderWrite) domain.ReportHeader {
	signers := make([]domain.ReportHeaderSigner, len(w.Signers))
	for i, s := range w.Signers {
		signers[i] = domain.ReportHeaderSigner{RoleLabel: s.RoleLabel, Name: s.Name, IDLabel: strOf(s.IdLabel), IDNumber: strOf(s.IdNumber)}
	}
	return domain.ReportHeader{ShowLogo: w.ShowLogo, Lines: w.Lines, Place: w.Place, Signers: signers}
}
