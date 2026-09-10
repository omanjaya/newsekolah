package http

import (
	"context"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *StaffAttendanceHandler) GetStaffAttendanceToday(ctx context.Context, request api.GetStaffAttendanceTodayRequestObject) (api.GetStaffAttendanceTodayResponseObject, error) {
	var date *time.Time
	if request.Params.Date != nil {
		date = &request.Params.Date.Time
	}
	views, err := h.service.GetTodayBoard(ctx, tenantIDFromContext(ctx), date)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStaffAttendanceToday200JSONResponse{Data: toAPIRecords(views)}, nil
}

func (h *StaffAttendanceHandler) ScanStaffAttendance(ctx context.Context, _ api.ScanStaffAttendanceRequestObject) (api.ScanStaffAttendanceResponseObject, error) {
	userID, _ := httpx.UserIDFromContext(ctx)
	view, err := h.service.Scan(ctx, tenantIDFromContext(ctx), userID)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScanStaffAttendance200JSONResponse(toAPIRecord(view)), nil
}

func (h *StaffAttendanceHandler) RecordStaffAttendanceManual(ctx context.Context, request api.RecordStaffAttendanceManualRequestObject) (api.RecordStaffAttendanceManualResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	userID, _ := httpx.UserIDFromContext(ctx)
	view, err := h.service.RecordManual(ctx, tenantIDFromContext(ctx), userID, toServiceEntryInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RecordStaffAttendanceManual200JSONResponse(toAPIRecord(view)), nil
}

func (h *StaffAttendanceHandler) ImportStaffAttendance(ctx context.Context, request api.ImportStaffAttendanceRequestObject) (api.ImportStaffAttendanceResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	userID, _ := httpx.UserIDFromContext(ctx)
	entries := make([]service.EntryInput, len(request.Body.Entries))
	for i, e := range request.Body.Entries {
		entries[i] = toServiceEntryInput(e)
	}
	views, err := h.service.ImportRecords(ctx, tenantIDFromContext(ctx), userID, entries)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ImportStaffAttendance200JSONResponse{Data: toAPIRecords(views)}, nil
}

func (h *StaffAttendanceHandler) GetStaffAttendanceHistory(ctx context.Context, request api.GetStaffAttendanceHistoryRequestObject) (api.GetStaffAttendanceHistoryResponseObject, error) {
	views, err := h.service.GetEmployeeHistory(ctx, tenantIDFromContext(ctx), request.EmployeeId, request.Params.From.Time, request.Params.To.Time)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStaffAttendanceHistory200JSONResponse{Data: toAPIRecords(views)}, nil
}
