// Package http implements staff attendance's slice of the generated
// api.StrictServerInterface: request/response mapping only, no business
// rules and no SQL (both live in service/ and repository/), per
// docs/03-layered-architecture.md section 1.
package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type StaffAttendanceHandler struct {
	service *service.Service
}

func New(svc *service.Service) *StaffAttendanceHandler {
	return &StaffAttendanceHandler{service: svc}
}

func tenantIDFromContext(ctx context.Context) uuid.UUID {
	if t, ok := tenant.FromContext(ctx); ok {
		return t.ID
	}
	return uuid.UUID{}
}

// tenantLocale resolves the current request's tenant to a locale
// reportdoc's FormatDate/PageLabel/EmptyRowsLabelFor understand,
// defaulting to Indonesian -- a generated report is the school's own
// document, so it follows the tenant's configured locale
// (tenants.locale), not the requester's Accept-Language header. Mirrors
// reports/transport/http.tenantLocale.
func tenantLocale(ctx context.Context) string {
	t, ok := tenant.FromContext(ctx)
	if !ok {
		return i18n.DefaultLocale
	}
	return i18n.FromTenantLocale(t.Locale)
}

// This module's own transport-local error codes, mirroring
// attendance/transport/http/handler.go's rationale for keeping
// module-specific codes out of the shared internal/platform/httpx/errors.go.
var (
	errModuleDisabled      = httpx.NewError(http.StatusNotFound, "MODULE_DISABLED")
	errScheduleDayInvalid  = httpx.NewError(http.StatusBadRequest, "STAFF_ATTENDANCE_SCHEDULE_DAY_INVALID")
	errAlreadyScannedBoth  = httpx.NewError(http.StatusConflict, "STAFF_ATTENDANCE_ALREADY_SCANNED")
	errCorrectionReasonReq = httpx.NewError(http.StatusBadRequest, "STAFF_ATTENDANCE_CORRECTION_REASON_REQUIRED")
	errInvalidMonth        = httpx.NewError(http.StatusBadRequest, "STAFF_ATTENDANCE_INVALID_MONTH")
)

// mapError translates a staffattendance/domain sentinel error into the
// stable *httpx.Error the API contract promises; anything unrecognized
// becomes a generic 500 rather than leaking internals.
func mapError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrModuleDisabled):
		return errModuleDisabled
	case errors.Is(err, domain.ErrRecordNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, domain.ErrScheduleDayInvalid):
		return errScheduleDayInvalid
	case errors.Is(err, domain.ErrAlreadyScannedBothWays):
		return errAlreadyScannedBoth
	case errors.Is(err, domain.ErrCorrectionReasonRequired):
		return errCorrectionReasonReq
	case errors.Is(err, domain.ErrInvalidMonth):
		return errInvalidMonth
	default:
		var appErr *httpx.Error
		if errors.As(err, &appErr) {
			return appErr
		}
		return httpx.Internal(err)
	}
}
