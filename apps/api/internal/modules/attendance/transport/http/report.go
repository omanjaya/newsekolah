package http

import (
	"bytes"
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *AttendanceHandler) GetDailyAttendanceReport(ctx context.Context, request api.GetDailyAttendanceReportRequestObject) (api.GetDailyAttendanceReportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	report, err := h.service.GetDailyReport(ctx, tenantID, request.Params.ClassId, request.Params.Date.Time)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetDailyAttendanceReport200JSONResponse(toAPIDailyReport(report)), nil
}

// GetOwnDailyAttendanceReport is the "own sessions" scope
// (docs/analysis/backend-inventory.md section 1.10): a teacher who lacks
// view_reports may still see their own day, across classes, without a
// class_id.
func (h *AttendanceHandler) GetOwnDailyAttendanceReport(ctx context.Context, request api.GetOwnDailyAttendanceReportRequestObject) (api.GetOwnDailyAttendanceReportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	sessions, err := h.service.GetOwnDailyReport(ctx, tenantID, userID, request.Params.Date.Time)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.GetOwnDailyAttendanceReport200JSONResponse{Data: toAPIDailyReportSessions(sessions)}, nil
}

func (h *AttendanceHandler) ExportDailyAttendanceReport(ctx context.Context, request api.ExportDailyAttendanceReportRequestObject) (api.ExportDailyAttendanceReportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	xlsx, err := h.service.ExportDailyReportXLSXScoped(ctx, tenantID, request.Params.ClassId, request.Params.GradeLevelId, request.Params.Date.Time)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.ExportDailyAttendanceReport200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

// ExportMonthlyAttendanceReport is the monthly recap as an XLSX file, for
// one class or every class of a grade level -- unlike
// GetMonthlyAttendanceSummary (one student's own calendar), this scopes to
// a class's or grade level's whole roster at once.
func (h *AttendanceHandler) ExportMonthlyAttendanceReport(ctx context.Context, request api.ExportMonthlyAttendanceReportRequestObject) (api.ExportMonthlyAttendanceReportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	xlsx, err := h.service.ExportMonthlyReportXLSX(ctx, tenantID, request.Params.ClassId, request.Params.GradeLevelId, request.Params.Month)
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.ExportMonthlyAttendanceReport200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}
