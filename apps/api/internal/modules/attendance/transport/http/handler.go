// Package http implements attendance's slice of the generated
// api.StrictServerInterface: request/response mapping only, no business
// rules and no SQL (both live in service/ and repository/), per
// docs/03-layered-architecture.md section 1.
package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type AttendanceHandler struct {
	service *service.Service
	perms   authz.PermissionsProvider
}

func New(svc *service.Service, perms authz.PermissionsProvider) *AttendanceHandler {
	return &AttendanceHandler{service: svc, perms: perms}
}

func tenantIDFromContext(ctx context.Context) uuid.UUID {
	if t, ok := tenant.FromContext(ctx); ok {
		return t.ID
	}
	return uuid.UUID{}
}

// actorFor resolves the caller's effective permissions into a
// service.Actor: CanViewAll backs the supervisory bypass on
// GetAttendanceSession (a role holding view_reports may read any session,
// not just their own), and IsGlobalCorrector mirrors
// domain.SaveWindowInput's field of the same name (correct_attendance may
// save in correction mode for any class).
func (h *AttendanceHandler) actorFor(ctx context.Context, tenantID, userID uuid.UUID) (service.Actor, error) {
	perms, err := h.perms.EffectivePermissions(ctx, tenantID, userID)
	if err != nil {
		return service.Actor{}, httpx.ErrInternal
	}
	return service.Actor{
		UserID: userID, CanViewAll: perms.Has(authz.PermViewReports), IsGlobalCorrector: perms.Has(authz.PermCorrectAttendance),
		CanManage: perms.Has(authz.PermManageAttendance),
	}, nil
}

// The attendance module's own transport-local error codes: specific enough
// to this module's responses that they live here rather than in the
// shared internal/platform/httpx/errors.go every module touches, mirroring
// scheduling/transport/http/handler.go's errScheduleConflictClass pattern.
var (
	errWindowClosed             = httpx.NewError(http.StatusConflict, "ATTENDANCE_WINDOW_CLOSED")
	errCorrectionWindowClosed   = httpx.NewError(http.StatusConflict, "ATTENDANCE_CORRECTION_WINDOW_CLOSED")
	errCorrectionNotAllowed     = httpx.NewError(http.StatusForbidden, "ATTENDANCE_CORRECTION_NOT_ALLOWED")
	errCorrectionReasonRequired = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_CORRECTION_REASON_REQUIRED")
	errStatusInvalid            = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_STATUS_INVALID")
	errForbiddenSchedule        = httpx.NewError(http.StatusForbidden, "ATTENDANCE_FORBIDDEN_SCHEDULE")
	errStudentNotInClass        = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_STUDENT_NOT_IN_CLASS")
	errNotHomeroom              = httpx.NewError(http.StatusForbidden, "ATTENDANCE_NOT_HOMEROOM")
	errNoActiveYear             = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_NO_ACTIVE_YEAR")
	errInvalidMonth             = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_INVALID_MONTH")
	errInvalidScope             = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_INVALID_SCOPE")
	errUnknownColumn            = httpx.NewError(http.StatusBadRequest, "ATTENDANCE_REPORT_UNKNOWN_COLUMN")
	errMonitorTokenInvalid      = httpx.NewError(http.StatusUnauthorized, "ATTENDANCE_MONITOR_TOKEN_INVALID")
)

// mapAttendanceError translates an attendance/domain sentinel error into
// the stable *httpx.Error the API contract promises; anything unrecognized
// becomes a generic 500 rather than leaking internals.
func mapAttendanceError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrSessionNotFound), errors.Is(err, domain.ErrEntryNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, domain.ErrNoAccess):
		return errForbiddenSchedule
	case errors.Is(err, domain.ErrNotHomeroomTeacher):
		return errNotHomeroom
	case errors.Is(err, domain.ErrInvalidStatusCode):
		return errStatusInvalid
	case errors.Is(err, domain.ErrStudentNotInClass):
		return errStudentNotInClass
	case errors.Is(err, domain.ErrSaveWindowClosed):
		return errWindowClosed
	case errors.Is(err, domain.ErrCorrectionWindowClosed):
		return errCorrectionWindowClosed
	case errors.Is(err, domain.ErrCorrectionNotAllowed):
		return errCorrectionNotAllowed
	case errors.Is(err, domain.ErrCorrectionReasonRequired):
		return errCorrectionReasonRequired
	case errors.Is(err, domain.ErrJournalRequired):
		return httpx.ErrValidation
	case errors.Is(err, domain.ErrNoActiveAcademicYear):
		return errNoActiveYear
	case errors.Is(err, domain.ErrInvalidMonth):
		return errInvalidMonth
	case errors.Is(err, domain.ErrInvalidScope):
		return errInvalidScope
	case errors.Is(err, reportdoc.ErrUnknownColumn):
		return errUnknownColumn
	default:
		var appErr *httpx.Error
		if errors.As(err, &appErr) {
			return appErr
		}
		return httpx.Internal(err)
	}
}

func errNotImplemented() error {
	return httpx.NewError(http.StatusNotImplemented, "NOT_IMPLEMENTED")
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
