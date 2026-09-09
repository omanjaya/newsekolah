// Package http implements attendance's slice of the generated
// api.StrictServerInterface. The attendance module itself (domain rules,
// service, repository) is not built yet in this worktree -- every
// operation here is an honest 501 so cmd/api compiles against the full
// api.StrictServerInterface instead of pretending attendance recording,
// reporting, and the realtime monitor already work.
package http

import (
	"context"
	"net/http"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type AttendanceHandler struct{}

func New() *AttendanceHandler {
	return &AttendanceHandler{}
}

func errNotImplemented() error {
	return httpx.NewError(http.StatusNotImplemented, "NOT_IMPLEMENTED")
}

func (*AttendanceHandler) ListMyAttendanceToday(_ context.Context, _ api.ListMyAttendanceTodayRequestObject) (api.ListMyAttendanceTodayResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) OpenAttendanceSession(_ context.Context, _ api.OpenAttendanceSessionRequestObject) (api.OpenAttendanceSessionResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetAttendanceSession(_ context.Context, _ api.GetAttendanceSessionRequestObject) (api.GetAttendanceSessionResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) SaveAttendanceEntries(_ context.Context, _ api.SaveAttendanceEntriesRequestObject) (api.SaveAttendanceEntriesResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetMyAttendanceCalendar(_ context.Context, _ api.GetMyAttendanceCalendarRequestObject) (api.GetMyAttendanceCalendarResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetHomeroomAttendance(_ context.Context, _ api.GetHomeroomAttendanceRequestObject) (api.GetHomeroomAttendanceResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetDailyAttendanceReport(_ context.Context, _ api.GetDailyAttendanceReportRequestObject) (api.GetDailyAttendanceReportResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) ExportDailyAttendanceReport(_ context.Context, _ api.ExportDailyAttendanceReportRequestObject) (api.ExportDailyAttendanceReportResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetMonthlyAttendanceSummary(_ context.Context, _ api.GetMonthlyAttendanceSummaryRequestObject) (api.GetMonthlyAttendanceSummaryResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetMonitorPresence(_ context.Context, _ api.GetMonitorPresenceRequestObject) (api.GetMonitorPresenceResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) GetMonitorSnapshot(_ context.Context, _ api.GetMonitorSnapshotRequestObject) (api.GetMonitorSnapshotResponseObject, error) {
	return nil, errNotImplemented()
}

// WsMe and WsMonitor are WebSocket upgrades: a strict handler cannot
// hijack the connection (it only ever writes a JSON response body), so
// these two can never be more than a 501 here. The real upgrade path is
// mounted directly on the chi router in cmd/api/wire.go, bypassing the
// strict handler chain entirely -- see the comment there.
func (*AttendanceHandler) WsMe(_ context.Context, _ api.WsMeRequestObject) (api.WsMeResponseObject, error) {
	return nil, errNotImplemented()
}

func (*AttendanceHandler) WsMonitor(_ context.Context, _ api.WsMonitorRequestObject) (api.WsMonitorResponseObject, error) {
	return nil, errNotImplemented()
}
