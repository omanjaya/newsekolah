package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
)

func (h *ActivitiesHandler) ListMeetings(ctx context.Context, request api.ListMeetingsRequestObject) (api.ListMeetingsResponseObject, error) {
	meetings, err := h.service.ListMeetings(ctx, tenantID(ctx), request.ClubId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.Meeting, len(meetings))
	for i, m := range meetings {
		data[i] = toAPIMeeting(m)
	}
	return api.ListMeetings200JSONResponse{Data: data}, nil
}

func (h *ActivitiesHandler) CreateMeeting(ctx context.Context, request api.CreateMeetingRequestObject) (api.CreateMeetingResponseObject, error) {
	b := request.Body
	meeting, err := h.service.CreateMeeting(ctx, tenantID(ctx), request.ClubId, b.MeetingDate.Time, strOr(b.Notes))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateMeeting201JSONResponse(toAPIMeeting(meeting)), nil
}

func (h *ActivitiesHandler) GetMeetingRoster(ctx context.Context, request api.GetMeetingRosterRequestObject) (api.GetMeetingRosterResponseObject, error) {
	roster, err := h.service.MeetingRosterFor(ctx, tenantID(ctx), request.MeetingId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMeetingRoster200JSONResponse{Meeting: toAPIMeeting(roster.Meeting), Entries: toAPIAttendanceList(roster.Entries)}, nil
}

func (h *ActivitiesHandler) RecordExtracurricularAttendance(ctx context.Context, request api.RecordExtracurricularAttendanceRequestObject) (api.RecordExtracurricularAttendanceResponseObject, error) {
	b := request.Body
	entry, err := h.service.RecordAttendance(ctx, tenantID(ctx), request.MeetingId, b.StudentUserId, domain.AttendanceStatus(b.StatusCode), strOr(b.Notes), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RecordExtracurricularAttendance200JSONResponse(toAPIAttendance(entry)), nil
}
