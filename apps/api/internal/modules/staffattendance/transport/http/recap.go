package http

import (
	"bytes"
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func (h *StaffAttendanceHandler) GetStaffAttendanceMonthlyRecap(ctx context.Context, request api.GetStaffAttendanceMonthlyRecapRequestObject) (api.GetStaffAttendanceMonthlyRecapResponseObject, error) {
	recap, err := h.service.GetMonthlyRecap(ctx, tenantIDFromContext(ctx), request.EmployeeId, request.Params.Month)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStaffAttendanceMonthlyRecap200JSONResponse(toAPIMonthlyRecap(recap)), nil
}

// reportOptions decodes the shared format/title/letterhead/columns query
// contract into reportdoc.Options, defaulting to XLSX with every column
// and the letterhead shown -- the behaviour every export kept before this
// query-param contract existed, so a caller that predates it (the mobile
// app included) never breaks.
func reportOptions(format *string, title *string, letterhead *bool, columns *string) reportdoc.Options {
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}
	if format != nil {
		opts.Format = reportdoc.Format(*format)
	}
	if title != nil {
		opts.Title = *title
	}
	if letterhead != nil {
		opts.ShowLetterhead = *letterhead
	}
	if columns != nil {
		for _, c := range httpx.ParseReportColumns(*columns) {
			opts.Columns = append(opts.Columns, reportdoc.ColumnChoice{Key: c.Key, Label: c.Label})
		}
	}
	return opts
}

type exportXLSXResponse struct{ body []byte }

func (r exportXLSXResponse) asStaffAttendanceRecap() api.ExportStaffAttendanceMonthlyRecapResponseObject {
	return api.ExportStaffAttendanceMonthlyRecap200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(r.body), ContentLength: int64(len(r.body)),
	}
}

func (r exportXLSXResponse) asAllStaffAttendanceRecap() api.ExportAllStaffAttendanceMonthlyRecapResponseObject {
	return api.ExportAllStaffAttendanceMonthlyRecap200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(r.body), ContentLength: int64(len(r.body)),
	}
}

type exportPDFResponse struct{ body []byte }

func (r exportPDFResponse) asStaffAttendanceRecap() api.ExportStaffAttendanceMonthlyRecapResponseObject {
	return api.ExportStaffAttendanceMonthlyRecap200ApplicationpdfResponse{
		Body: bytes.NewReader(r.body), ContentLength: int64(len(r.body)),
	}
}

func (r exportPDFResponse) asAllStaffAttendanceRecap() api.ExportAllStaffAttendanceMonthlyRecapResponseObject {
	return api.ExportAllStaffAttendanceMonthlyRecap200ApplicationpdfResponse{
		Body: bytes.NewReader(r.body), ContentLength: int64(len(r.body)),
	}
}

func (h *StaffAttendanceHandler) ExportStaffAttendanceMonthlyRecap(ctx context.Context, request api.ExportStaffAttendanceMonthlyRecapRequestObject) (api.ExportStaffAttendanceMonthlyRecapResponseObject, error) {
	p := request.Params
	var format *string
	if p.Format != nil {
		f := string(*p.Format)
		format = &f
	}
	opts := reportOptions(format, p.Title, p.Letterhead, p.Columns)
	body, err := h.service.ExportMonthlyRecapReport(ctx, tenantIDFromContext(ctx), request.EmployeeId, p.Month, tenantLocale(ctx), opts)
	if err != nil {
		return nil, mapError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return exportPDFResponse{body: body}.asStaffAttendanceRecap(), nil
	}
	return exportXLSXResponse{body: body}.asStaffAttendanceRecap(), nil
}

// ExportAllStaffAttendanceMonthlyRecap is the tenant-wide counterpart to
// ExportStaffAttendanceMonthlyRecap: every tracked employee's recap for the
// month in one workbook or PDF, for the administrative export screen
// rather than one employee's own history.
func (h *StaffAttendanceHandler) ExportAllStaffAttendanceMonthlyRecap(ctx context.Context, request api.ExportAllStaffAttendanceMonthlyRecapRequestObject) (api.ExportAllStaffAttendanceMonthlyRecapResponseObject, error) {
	p := request.Params
	var format *string
	if p.Format != nil {
		f := string(*p.Format)
		format = &f
	}
	opts := reportOptions(format, p.Title, p.Letterhead, p.Columns)
	body, err := h.service.ExportAllEmployeesMonthlyRecapReport(ctx, tenantIDFromContext(ctx), p.Month, tenantLocale(ctx), opts)
	if err != nil {
		return nil, mapError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return exportPDFResponse{body: body}.asAllStaffAttendanceRecap(), nil
	}
	return exportXLSXResponse{body: body}.asAllStaffAttendanceRecap(), nil
}
