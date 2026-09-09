package http

import (
	"bytes"
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *AttendanceHandler) GetDailyAttendanceReport(ctx context.Context, request api.GetDailyAttendanceReportRequestObject) (api.GetDailyAttendanceReportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	report, err := h.service.GetDailyReport(ctx, tenantID, request.Params.ClassId, request.Params.Date.Time)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetDailyAttendanceReport200JSONResponse(toAPIDailyReport(report)), nil
}

func (h *AttendanceHandler) ExportDailyAttendanceReport(ctx context.Context, request api.ExportDailyAttendanceReportRequestObject) (api.ExportDailyAttendanceReportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	xlsx, err := h.service.ExportDailyReportXLSX(ctx, tenantID, request.Params.ClassId, request.Params.Date.Time)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.ExportDailyAttendanceReport200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}
