package http

import (
	"bytes"
	"context"
	"errors"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func (h *Handler) DownloadUserImportTemplate(_ context.Context, _ api.DownloadUserImportTemplateRequestObject) (api.DownloadUserImportTemplateResponseObject, error) {
	file, err := h.service.ImportTemplate()
	if err != nil {
		return nil, httpx.ErrInternal
	}
	return api.DownloadUserImportTemplate200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(file), ContentLength: int64(len(file)),
	}, nil
}

func (h *Handler) PreviewUserImport(ctx context.Context, request api.PreviewUserImportRequestObject) (api.PreviewUserImportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	outcomes, err := h.service.PreviewImport(ctx, tenantID, actorID, fromAPIImportRows(request.Body.Rows), fromAPIImportOptions(request.Body))
	if err != nil {
		return nil, mapImportError(err)
	}
	return api.PreviewUserImport200JSONResponse(toAPIImportResult(outcomes)), nil
}

func (h *Handler) CommitUserImport(ctx context.Context, request api.CommitUserImportRequestObject) (api.CommitUserImportResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	actorID, _ := httpx.UserIDFromContext(ctx)
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	outcomes, err := h.service.CommitImport(ctx, tenantID, actorID, fromAPIImportRows(request.Body.Rows), fromAPIImportOptions(request.Body))
	if err != nil {
		return nil, mapImportError(err)
	}
	return api.CommitUserImport200JSONResponse(toAPIImportResult(outcomes)), nil
}

func mapImportError(err error) error {
	switch {
	case errors.Is(err, domain.ErrImportEmpty):
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "rows", Code: "EMPTY"})
	case errors.Is(err, domain.ErrImportTooManyRows):
		return httpx.ErrImportTooManyRows
	case errors.Is(err, domain.ErrImportHasRowErrors):
		// Not an error to the caller in the usual sense: the response
		// body already carries every row's errors. Mapped to 400 so the
		// client's error handling still treats "nothing committed" as a
		// failure, distinct from the 200 a clean commit returns.
		return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "rows", Code: "HAS_ROW_ERRORS"})
	case errors.Is(err, domain.ErrImportRoleUpdateForbidden):
		return httpx.ErrImportRoleUpdateForbidden
	}
	return mapAdminError(err)
}

// fromAPIImportOptions reads the request-level mode/update_roles fields,
// both optional: an absent mode is domain.ImportModeCreate (the historical
// create-only behaviour), an absent update_roles is false (never touch an
// existing user's roles).
func fromAPIImportOptions(body *api.UserImportRequest) service.ImportOptions {
	opts := service.ImportOptions{Mode: domain.ImportModeCreate}
	if body.Mode != nil {
		opts.Mode = domain.ImportMode(*body.Mode)
	}
	if body.UpdateRoles != nil {
		opts.UpdateRoles = *body.UpdateRoles
	}
	return opts
}

func fromAPIImportRows(rows []api.UserImportRow) []domain.ImportRow {
	out := make([]domain.ImportRow, len(rows))
	for i, r := range rows {
		row := domain.ImportRow{
			Name: r.Name, ProfileKind: domain.ProfileKind(r.ProfileKind), RoleSlug: r.RoleSlug,
			Username: strOf(r.Username), Email: strOf(r.Email), Password: strOf(r.Password),
			NIK: strOf(r.Nik), Gender: strOf(r.Gender), BirthPlace: strOf(r.BirthPlace), BirthDate: strOf(r.BirthDate),
			Religion: strOf(r.Religion), Address: strOf(r.Address), District: strOf(r.District), City: strOf(r.City),
			Phone: strOf(r.Phone), BloodType: strOf(r.BloodType),
			NIS: strOf(r.Nis), NISN: strOf(r.Nisn), EntryYear: strOf(r.EntryYear),
			FatherName: strOf(r.FatherName), MotherName: strOf(r.MotherName),
			GuardianName: strOf(r.GuardianName), GuardianPhone: strOf(r.GuardianPhone),
			ParentOccupation: strOf(r.ParentOccupation), PreviousSchool: strOf(r.PreviousSchool),
			NIP: strOf(r.Nip), NUPTK: strOf(r.Nuptk), LastEducation: strOf(r.LastEducation),
			EmploymentStatus: strOf(r.EmploymentStatus), JoinedYear: strOf(r.JoinedYear),
			Specialization: strOf(r.Specialization), EmployeeNumber: strOf(r.EmployeeNumber), Position: strOf(r.Position),
		}
		if r.RowNumber != nil {
			row.RowNumber = *r.RowNumber
		}
		out[i] = row
	}
	return out
}

// toAPIImportResult builds the whole response body: every row's outcome,
// plus the create/update/unchanged counts the web import screen's preview
// step shows before commit.
func toAPIImportResult(outcomes []service.ImportRowOutcome) api.UserImportResult {
	created, updated, unchanged := 0, 0, 0
	for _, o := range outcomes {
		switch o.Action {
		case domain.ImportActionCreate:
			created++
		case domain.ImportActionUpdate:
			updated++
		case domain.ImportActionUnchanged:
			unchanged++
		}
	}
	return api.UserImportResult{
		Data: toAPIImportOutcomes(outcomes), Created: &created, Updated: &updated, Unchanged: &unchanged,
	}
}

func toAPIImportOutcomes(outcomes []service.ImportRowOutcome) []api.UserImportRowResult {
	out := make([]api.UserImportRowResult, len(outcomes))
	for i, o := range outcomes {
		result := api.UserImportRowResult{
			RowNumber: o.RowNumber, Action: api.UserImportRowAction(o.Action), Errors: o.Errors,
		}
		if o.Username != "" {
			username := o.Username
			result.Username = &username
		}
		if len(o.Changes) > 0 {
			changes := o.Changes
			result.ChangedFields = &changes
		}
		out[i] = result
	}
	return out
}
