// Package http adapts the generated strict-server interface to the report
// centre. Permission is checked per report here (the operation itself is
// only "authenticated") so one endpoint can serve the whole catalogue.
package http

import (
	"bytes"
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// PermissionChecker resolves the caller's effective permissions.
type PermissionChecker interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error)
}

type ReportsHandler struct {
	service *service.Service
	perms   PermissionChecker
}

func New(svc *service.Service, perms PermissionChecker) *ReportsHandler {
	return &ReportsHandler{service: svc, perms: perms}
}

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

func mapError(err error) error {
	switch {
	case errors.Is(err, service.ErrReportNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, service.ErrMissingArgument):
		return httpx.ErrValidation
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
	xlsx, err := h.service.Run(ctx, tenantID(ctx), kind, args)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ExportReport200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}
