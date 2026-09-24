// Package http adapts the generated strict-server interface to the
// visitors service.
package http

import (
	"bytes"
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type VisitorsHandler struct{ service *service.Service }

func New(svc *service.Service) *VisitorsHandler { return &VisitorsHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	domain.ErrExpectedGuestNotFound:  httpx.ErrExpectedGuestNotFound,
	domain.ErrExpectedGuestResolved:  httpx.ErrExpectedGuestResolved,
	domain.ErrVisitNotFound:          httpx.ErrVisitNotFound,
	domain.ErrVisitAlreadyCheckedOut: httpx.ErrVisitAlreadyCheckedOut,
	domain.ErrIncidentNotFound:       httpx.ErrIncidentNotFound,
	domain.ErrIncidentAlreadyClosed:  httpx.ErrIncidentAlreadyClosed,
	domain.ErrIncidentForbidden:      httpx.ErrIncidentForbidden,
	domain.ErrModuleDisabled:         httpx.ErrVisitorsModuleDisabled,
	domain.ErrInvalidInput:           httpx.ErrValidation,
}

func mapError(err error) error {
	for d, h := range errorMap {
		if errors.Is(err, d) {
			return h
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func intOr(p *int, def int) int {
	if p == nil {
		return def
	}
	return *p
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

// Expected guests.

func (h *VisitorsHandler) ListExpectedGuests(ctx context.Context, request api.ListExpectedGuestsRequestObject) (api.ListExpectedGuestsResponseObject, error) {
	rows, err := h.service.ListExpectedGuests(ctx, tenantID(ctx), request.Params.Date.Time, boolOr(request.Params.IncludeResolved, false))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListExpectedGuests200JSONResponse{Data: toAPIExpectedGuests(rows)}, nil
}

func (h *VisitorsHandler) CreateExpectedGuest(ctx context.Context, request api.CreateExpectedGuestRequestObject) (api.CreateExpectedGuestResponseObject, error) {
	b := request.Body
	g, err := h.service.CreateExpectedGuest(ctx, tenantID(ctx), userID(ctx), service.ExpectedGuestInput{
		FullName: b.FullName, Organization: strOr(b.Organization), HostUserID: b.HostUserId,
		Purpose: strOr(b.Purpose), ExpectedDate: b.ExpectedDate.Time, Notes: strOr(b.Notes),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateExpectedGuest201JSONResponse(toAPIExpectedGuest(g)), nil
}

func (h *VisitorsHandler) CancelExpectedGuest(ctx context.Context, request api.CancelExpectedGuestRequestObject) (api.CancelExpectedGuestResponseObject, error) {
	if err := h.service.CancelExpectedGuest(ctx, tenantID(ctx), request.ExpectedGuestId); err != nil {
		return nil, mapError(err)
	}
	return api.CancelExpectedGuest204Response{}, nil
}

// Board and visits.

func (h *VisitorsHandler) GetVisitorBoard(ctx context.Context, _ api.GetVisitorBoardRequestObject) (api.GetVisitorBoardResponseObject, error) {
	entries, err := h.service.Board(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetVisitorBoard200JSONResponse{Data: toAPIBoard(entries)}, nil
}

func (h *VisitorsHandler) ListVisits(ctx context.Context, request api.ListVisitsRequestObject) (api.ListVisitsResponseObject, error) {
	p := request.Params
	rows, err := h.service.ListVisits(ctx, tenantID(ctx), p.From, p.To, intOr(p.Limit, 50), intOr(p.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListVisits200JSONResponse{Data: toAPIVisits(rows)}, nil
}

func (h *VisitorsHandler) CheckInVisit(ctx context.Context, request api.CheckInVisitRequestObject) (api.CheckInVisitResponseObject, error) {
	b := request.Body
	var expectedGuestID uuid.NullUUID
	if b.ExpectedGuestId != nil {
		expectedGuestID = uuid.NullUUID{UUID: *b.ExpectedGuestId, Valid: true}
	}
	visit, err := h.service.CheckIn(ctx, tenantID(ctx), userID(ctx), service.CheckInInput{
		ExpectedGuestID: expectedGuestID, FullName: b.FullName, Organization: strOr(b.Organization), HostUserID: b.HostUserId,
		Purpose: strOr(b.Purpose), IDChecked: b.IdChecked, IDType: domain.IdentificationType(b.IdType),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CheckInVisit201JSONResponse(toAPIVisit(visit)), nil
}

func (h *VisitorsHandler) GetVisit(ctx context.Context, request api.GetVisitRequestObject) (api.GetVisitResponseObject, error) {
	visit, err := h.service.GetVisit(ctx, tenantID(ctx), request.VisitId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetVisit200JSONResponse(toAPIVisit(visit)), nil
}

func (h *VisitorsHandler) CheckOutVisit(ctx context.Context, request api.CheckOutVisitRequestObject) (api.CheckOutVisitResponseObject, error) {
	visit, err := h.service.CheckOut(ctx, tenantID(ctx), request.VisitId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CheckOutVisit200JSONResponse(toAPIVisit(visit)), nil
}

func (h *VisitorsHandler) GetVisitBadgeUrl(ctx context.Context, request api.GetVisitBadgeUrlRequestObject) (api.GetVisitBadgeUrlResponseObject, error) {
	url, err := h.service.BadgeURL(ctx, tenantID(ctx), request.VisitId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetVisitBadgeUrl200JSONResponse{Url: url}, nil
}

// Incidents.

func (h *VisitorsHandler) ListIncidents(ctx context.Context, request api.ListIncidentsRequestObject) (api.ListIncidentsResponseObject, error) {
	p := request.Params
	rows, err := h.service.ListIncidents(ctx, tenantID(ctx), userID(ctx), p.From, p.To, boolOr(p.IncludeClosed, true), intOr(p.Limit, 50), intOr(p.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListIncidents200JSONResponse{Data: toAPIIncidents(rows)}, nil
}

func (h *VisitorsHandler) CreateIncident(ctx context.Context, request api.CreateIncidentRequestObject) (api.CreateIncidentResponseObject, error) {
	b := request.Body
	in, err := h.service.CreateIncident(ctx, tenantID(ctx), userID(ctx), service.IncidentInput{
		OccurredAt: b.OccurredAt, Severity: domain.Severity(b.Severity), Description: b.Description,
		PersonsInvolved: strOr(b.PersonsInvolved), ActionTaken: strOr(b.ActionTaken),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateIncident201JSONResponse(toAPIIncident(in)), nil
}

func (h *VisitorsHandler) GetIncident(ctx context.Context, request api.GetIncidentRequestObject) (api.GetIncidentResponseObject, error) {
	in, err := h.service.GetIncident(ctx, tenantID(ctx), request.IncidentId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetIncident200JSONResponse(toAPIIncident(in)), nil
}

func (h *VisitorsHandler) UpdateIncident(ctx context.Context, request api.UpdateIncidentRequestObject) (api.UpdateIncidentResponseObject, error) {
	b := request.Body
	in, err := h.service.UpdateIncident(ctx, tenantID(ctx), request.IncidentId, service.IncidentInput{
		OccurredAt: b.OccurredAt, Severity: domain.Severity(b.Severity), Description: b.Description,
		PersonsInvolved: strOr(b.PersonsInvolved), ActionTaken: strOr(b.ActionTaken),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateIncident200JSONResponse(toAPIIncident(in)), nil
}

func (h *VisitorsHandler) CloseIncident(ctx context.Context, request api.CloseIncidentRequestObject) (api.CloseIncidentResponseObject, error) {
	in, err := h.service.CloseIncident(ctx, tenantID(ctx), request.IncidentId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CloseIncident200JSONResponse(toAPIIncident(in)), nil
}

// Recap.

func (h *VisitorsHandler) GetDailyVisitorRecap(ctx context.Context, request api.GetDailyVisitorRecapRequestObject) (api.GetDailyVisitorRecapResponseObject, error) {
	recap, err := h.service.DailyRecap(ctx, tenantID(ctx), request.Params.Date.Time)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetDailyVisitorRecap200JSONResponse(toAPIRecap(recap)), nil
}

func (h *VisitorsHandler) ExportDailyVisitorRecap(ctx context.Context, request api.ExportDailyVisitorRecapRequestObject) (api.ExportDailyVisitorRecapResponseObject, error) {
	recap, err := h.service.DailyRecap(ctx, tenantID(ctx), request.Params.Date.Time)
	if err != nil {
		return nil, mapError(err)
	}
	opts := recapOptions(formatPtr(request.Params.Format), request.Params.Title, request.Params.Letterhead, request.Params.Columns)
	body, err := h.service.ExportRecapReport(ctx, tenantID(ctx), "Rekap Kunjungan Harian", recap, opts)
	if err != nil {
		return nil, mapReportError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return api.ExportDailyVisitorRecap200ApplicationpdfResponse{
			Body: bytes.NewReader(body), ContentLength: int64(len(body)),
		}, nil
	}
	return api.ExportDailyVisitorRecap200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(body), ContentLength: int64(len(body)),
	}, nil
}

func (h *VisitorsHandler) GetMonthlyVisitorRecap(ctx context.Context, request api.GetMonthlyVisitorRecapRequestObject) (api.GetMonthlyVisitorRecapResponseObject, error) {
	recap, err := h.service.MonthlyRecap(ctx, tenantID(ctx), request.Params.Month.Time)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMonthlyVisitorRecap200JSONResponse(toAPIRecap(recap)), nil
}

func (h *VisitorsHandler) ExportMonthlyVisitorRecap(ctx context.Context, request api.ExportMonthlyVisitorRecapRequestObject) (api.ExportMonthlyVisitorRecapResponseObject, error) {
	recap, err := h.service.MonthlyRecap(ctx, tenantID(ctx), request.Params.Month.Time)
	if err != nil {
		return nil, mapError(err)
	}
	opts := recapOptions(formatPtr(request.Params.Format), request.Params.Title, request.Params.Letterhead, request.Params.Columns)
	body, err := h.service.ExportRecapReport(ctx, tenantID(ctx), "Rekap Kunjungan Bulanan", recap, opts)
	if err != nil {
		return nil, mapReportError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return api.ExportMonthlyVisitorRecap200ApplicationpdfResponse{
			Body: bytes.NewReader(body), ContentLength: int64(len(body)),
		}, nil
	}
	return api.ExportMonthlyVisitorRecap200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(body), ContentLength: int64(len(body)),
	}, nil
}

// formatPtr widens oapi-codegen's per-operation Format enum type (a
// distinct named string type per operation, even though every export
// endpoint declares the same [xlsx, pdf] enum) to a plain *string, so one
// recapOptions can serve both exports below.
func formatPtr[T ~string](p *T) *string {
	if p == nil {
		return nil
	}
	s := string(*p)
	return &s
}

// recapOptions decodes the shared format/title/letterhead/columns query
// contract into reportdoc.Options, defaulting to XLSX with every column
// and the letterhead shown -- the behaviour both recap exports kept
// before this query-param contract existed, so a caller that predates it
// never breaks.
func recapOptions(format *string, title *string, letterhead *bool, columns *string) reportdoc.Options {
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}
	if format != nil {
		opts.Format = reportdoc.Format(*format)
	}
	if title != nil {
		opts.Title = *title
	}
	if letterhead != nil {
		opts.ShowLetterhead = *letterhead
	}
	if columns != nil {
		for _, c := range httpx.ParseReportColumns(*columns) {
			opts.Columns = append(opts.Columns, reportdoc.ColumnChoice{Key: c.Key, Label: c.Label})
		}
	}
	return opts
}

func mapReportError(err error) error {
	if errors.Is(err, reportdoc.ErrUnknownColumn) {
		return httpx.ErrValidation
	}
	return mapError(err)
}
