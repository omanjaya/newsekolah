package main

import (
	"errors"
	"log/slog"
	"net/http"

	academichttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/transport/http"
	analyticshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/transport/http"
	announcementshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/transport/http"
	attendancehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/transport/http"
	billinghttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/transport/http"
	disciplinehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/transport/http"
	familyhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/family/transport/http"
	gradinghttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/transport/http"
	identityhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/transport/http"
	integrationshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/transport/http"
	libraryhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/transport/http"
	notificationshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/transport/http"
	permitshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/transport/http"
	platformhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/transport/http"
	reportshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/transport/http"
	schedulinghttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	schoolhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// combinedServer satisfies api.StrictServerInterface by embedding each
// module's handler plus the wiring-only health handler: Go promotes their
// methods, so no operation is implemented twice.
type combinedServer struct {
	*identityhttp.Handler
	*schoolhttp.TenantHandler
	*schedulinghttp.SchedulingHandler
	*attendancehttp.AttendanceHandler
	*academichttp.AcademicHandler
	*permitshttp.PermitsHandler
	*notificationshttp.NotificationsHandler
	*announcementshttp.AnnouncementsHandler
	*disciplinehttp.DisciplineHandler
	*gradinghttp.GradingHandler
	*reportshttp.ReportsHandler
	*familyhttp.FamilyHandler
	*platformhttp.PlatformHandler
	*libraryhttp.LibraryHandler
	*integrationshttp.IntegrationsHandler
	*analyticshttp.AnalyticsHandler
	*billinghttp.BillingHandler
	*healthHandler
}

// decodeErrorHandler renders a request-decoding failure (bad JSON, a
// missing required parameter) in the same {error:{code,message}} envelope
// as every other error, instead of oapi-codegen's default plain-text body.
func decodeErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	httpx.WriteError(w, r, httpx.WrapError(http.StatusBadRequest, "VALIDATION_FAILED", err))
}

// responseErrorHandler renders whatever the strict handler chain returned
// as an error -- almost always a *httpx.Error produced by a service/domain
// error mapping, or by authz.Authorize itself.
func responseErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	var appErr *httpx.Error
	if !errors.As(err, &appErr) || appErr.Status >= http.StatusInternalServerError {
		slog.ErrorContext(r.Context(), "unhandled request error",
			"error", err, "method", r.Method, "path", r.URL.Path,
			"request_id", httpx.RequestIDFromContext(r.Context()))
	}
	httpx.WriteError(w, r, err)
}
