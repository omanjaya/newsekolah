package http

import (
	"bytes"
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *StaffAttendanceHandler) GetStaffAttendanceMonthlyRecap(ctx context.Context, request api.GetStaffAttendanceMonthlyRecapRequestObject) (api.GetStaffAttendanceMonthlyRecapResponseObject, error) {
	recap, err := h.service.GetMonthlyRecap(ctx, tenantIDFromContext(ctx), request.EmployeeId, request.Params.Month)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStaffAttendanceMonthlyRecap200JSONResponse(toAPIMonthlyRecap(recap)), nil
}

func (h *StaffAttendanceHandler) ExportStaffAttendanceMonthlyRecap(ctx context.Context, request api.ExportStaffAttendanceMonthlyRecapRequestObject) (api.ExportStaffAttendanceMonthlyRecapResponseObject, error) {
	xlsx, err := h.service.ExportMonthlyRecapXLSX(ctx, tenantIDFromContext(ctx), request.EmployeeId, request.Params.Month)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ExportStaffAttendanceMonthlyRecap200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}
