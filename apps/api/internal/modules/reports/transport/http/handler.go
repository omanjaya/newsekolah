// Package http adapts the generated strict-server interface to the report
// centre. Permission is checked per report here (the operation itself is
// only "authenticated") so one endpoint can serve the whole catalogue.
package http

import (
	"bytes"
	"context"
	"errors"
	"net/url"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	gradingdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// PermissionChecker resolves the caller's effective permissions.
type PermissionChecker interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error)
}

type ReportsHandler struct {
	service   *service.Service
	schedules *service.ScheduleService
	perms     PermissionChecker
}

func New(svc *service.Service, schedules *service.ScheduleService, perms PermissionChecker) *ReportsHandler {
	return &ReportsHandler{service: svc, schedules: schedules, perms: perms}
}

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

func mapError(err error) error {
	switch {
	case errors.Is(err, service.ErrReportNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, service.ErrMissingArgument),
		errors.Is(err, service.ErrScopeConflict),
		errors.Is(err, service.ErrSubjectNotOffered),
		errors.Is(err, service.ErrNoActiveAcademicYear),
		errors.Is(err, disciplinedomain.ErrNoActiveAcademicYear),
		errors.Is(err, gradingdomain.ErrNoActiveAcademicYear):
		return httpx.ErrValidation
	case errors.Is(err, academicdomain.ErrClassNotFound),
		errors.Is(err, academicdomain.ErrGradeLevelNotFound),
		errors.Is(err, academicdomain.ErrSubjectNotFound):
		return httpx.ErrNotFound
	}
	var unknownColumn *reportdoc.UnknownColumnError
	if errors.As(err, &unknownColumn) {
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "columns", Code: "UNKNOWN_COLUMN"})
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func (h *ReportsHandler) permissions(ctx context.Context) authz.Set {
	if h.perms == nil {
		return nil
	}
	set, err := h.perms.EffectivePermissions(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil
	}
	return set
}

// ListReports returns only the reports the caller may actually run, so the
// UI never offers a download that ends in 403.
func (h *ReportsHandler) ListReports(ctx context.Context, _ api.ListReportsRequestObject) (api.ListReportsResponseObject, error) {
	granted := h.permissions(ctx)
	data := make([]api.ReportDefinition, 0, len(service.Catalog()))
	for _, def := range service.Catalog() {
		if !granted.Has(def.Permission) {
			continue
		}
		args := make([]api.ReportArgument, len(def.Arguments))
		for i, a := range def.Arguments {
			args[i] = api.ReportArgument{Name: a.Name, Kind: api.ReportArgumentKind(a.Kind), Required: a.Required}
		}
		data = append(data, api.ReportDefinition{Kind: string(def.Kind), Permission: def.Permission, Arguments: args})
	}
	return api.ListReports200JSONResponse{Data: data}, nil
}

func (h *ReportsHandler) ExportReport(ctx context.Context, request api.ExportReportRequestObject) (api.ExportReportResponseObject, error) {
	kind := service.Kind(request.ReportKind)
	def, ok := service.Find(kind)
	if !ok {
		return nil, httpx.ErrNotFound
	}
	if !h.permissions(ctx).Has(def.Permission) {
		return nil, httpx.ErrForbidden
	}
	args := service.RunArgs{}
	if request.Params.ClassId != nil {
		args.ClassID = uuid.NullUUID{UUID: *request.Params.ClassId, Valid: true}
	}
	if request.Params.GradeLevelId != nil {
		args.GradeLevelID = uuid.NullUUID{UUID: *request.Params.GradeLevelId, Valid: true}
	}
	if request.Params.SubjectId != nil {
		args.SubjectID = uuid.NullUUID{UUID: *request.Params.SubjectId, Valid: true}
	}
	if request.Params.TermId != nil {
		args.TermID = uuid.NullUUID{UUID: *request.Params.TermId, Valid: true}
	}
	if request.Params.Date != nil {
		date := request.Params.Date.Time
		args.Date = &date
	}

	opts := exportOptionsFromParams(request.Params)
	out, contentType, err := h.service.RunDocument(ctx, tenantID(ctx), kind, args, opts)
	if err != nil {
		return nil, mapError(err)
	}
	if contentType == service.PDFContentType {
		return api.ExportReport200ApplicationpdfResponse{Body: bytes.NewReader(out), ContentLength: int64(len(out))}, nil
	}
	return api.ExportReport200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(out), ContentLength: int64(len(out)),
	}, nil
}

// exportOptionsFromParams decodes format/title/letterhead/columns into
// reportdoc.Options. letterhead defaults to true (a report a school
// downloads is normally meant to be printed/filed with its kop laporan);
// columns is a comma list of `key` or `key:Label`, the label URL-decoded
// -- see openapi/modules/reports.yaml's exportReport description.
func exportOptionsFromParams(params api.ExportReportParams) reportdoc.Options {
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}
	if params.Format != nil && reportdoc.Format(*params.Format).Valid() {
		opts.Format = reportdoc.Format(*params.Format)
	}
	if params.Title != nil {
		opts.Title = *params.Title
	}
	if params.Letterhead != nil {
		opts.ShowLetterhead = *params.Letterhead
	}
	if params.Columns != nil && *params.Columns != "" {
		for _, part := range strings.Split(*params.Columns, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			key, label, _ := strings.Cut(part, ":")
			if decoded, err := url.QueryUnescape(label); err == nil {
				label = decoded
			}
			opts.Columns = append(opts.Columns, reportdoc.ColumnChoice{Key: key, Label: label})
		}
	}
	return opts
}
