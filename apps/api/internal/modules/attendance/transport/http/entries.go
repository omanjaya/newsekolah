package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func toSaveEntriesInput(body api.SaveAttendanceEntriesRequest) service.SaveEntriesInput {
	in := service.SaveEntriesInput{Mode: domain.SaveModeNormal, Entries: make([]service.SaveEntryInput, len(body.Entries))}
	if body.Mode != nil {
		in.Mode = domain.SaveMode(*body.Mode)
	}
	if body.Reason != nil {
		in.Reason = *body.Reason
	}
	for i, e := range body.Entries {
		entry := service.SaveEntryInput{StudentUserID: e.StudentUserId, StatusCode: e.StatusCode}
		if e.Notes != nil {
			entry.Notes = *e.Notes
		}
		in.Entries[i] = entry
	}
	if body.Journal != nil {
		journal := &service.SaveJournalInput{Topic: body.Journal.Topic, Activities: body.Journal.Activities}
		if body.Journal.Reflection != nil {
			journal.Reflection = *body.Journal.Reflection
		}
		in.Journal = journal
	}
	return in
}

func (h *AttendanceHandler) SaveAttendanceEntries(ctx context.Context, request api.SaveAttendanceEntriesRequestObject) (api.SaveAttendanceEntriesResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	detail, err := h.service.SaveEntries(ctx, tenantID, actor, request.SessionId, toSaveEntriesInput(*request.Body))
	if err != nil {
		return nil, mapAttendanceError(err)
	}
	return api.SaveAttendanceEntries200JSONResponse(toAPISessionDetail(detail)), nil
}
