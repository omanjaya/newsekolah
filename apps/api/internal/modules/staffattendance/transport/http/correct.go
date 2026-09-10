package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *StaffAttendanceHandler) CorrectStaffAttendanceRecord(ctx context.Context, request api.CorrectStaffAttendanceRecordRequestObject) (api.CorrectStaffAttendanceRecordResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	userID, _ := httpx.UserIDFromContext(ctx)
	body := request.Body

	in := service.CorrectionInput{ArrivalAt: body.ArrivalAt, DepartureAt: body.DepartureAt, Notes: body.Notes, Reason: body.Reason}
	if body.ClearArrival != nil {
		in.ClearArrival = *body.ClearArrival
	}
	if body.ClearDeparture != nil {
		in.ClearDeparture = *body.ClearDeparture
	}

	view, err := h.service.CorrectRecord(ctx, tenantIDFromContext(ctx), request.RecordId, userID, in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CorrectStaffAttendanceRecord200JSONResponse(toAPIRecord(view)), nil
}
