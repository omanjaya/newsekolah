package http

import (
	"context"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func toAPIVisit(v domain.Visit) api.LibraryVisit {
	out := api.LibraryVisit{
		Id: v.ID, Kind: api.LibraryVisitKind(v.Kind), Source: api.LibraryVisitSource(v.Source),
		VisitedAt: v.VisitedAt, GroupSize: v.GroupSize,
	}
	if v.MemberUserID.Valid {
		id := openapi_types.UUID(v.MemberUserID.UUID)
		out.MemberUserId = &id
	}
	if v.VisitorName != "" {
		out.VisitorName = &v.VisitorName
	}
	if v.Purpose != "" {
		out.Purpose = &v.Purpose
	}
	return out
}

func (h *LibraryHandler) ListLibraryVisits(ctx context.Context, request api.ListLibraryVisitsRequestObject) (api.ListLibraryVisitsResponseObject, error) {
	visits, err := h.service.ListVisits(ctx, tenantID(ctx), request.Params.From, request.Params.To)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryVisit, len(visits))
	for i, v := range visits {
		data[i] = toAPIVisit(v)
	}
	return api.ListLibraryVisits200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) RecordLibraryVisit(ctx context.Context, request api.RecordLibraryVisitRequestObject) (api.RecordLibraryVisitResponseObject, error) {
	b := request.Body
	in := service.RecordVisitInput{
		VisitorName: strOr(b.VisitorName), Kind: domain.VisitKind(b.Kind), Purpose: strOr(b.Purpose),
		GroupSize: intOr(b.GroupSize, 1), Source: domain.VisitSourceManual, CreatedBy: uuid.NullUUID{UUID: userID(ctx), Valid: true},
	}
	if b.MemberUserId != nil {
		in.MemberUserID = uuid.NullUUID{UUID: *b.MemberUserId, Valid: true}
	}
	v, err := h.service.RecordVisit(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.RecordLibraryVisit201JSONResponse(toAPIVisit(v)), nil
}

func (h *LibraryHandler) GetTodayLibraryVisitSummary(ctx context.Context, _ api.GetTodayLibraryVisitSummaryRequestObject) (api.GetTodayLibraryVisitSummaryResponseObject, error) {
	summary, err := h.service.TodayVisitSummary(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetTodayLibraryVisitSummary200JSONResponse{
		TotalVisits: summary.TotalVisits, UniqueMembers: summary.UniqueMembers, TotalPeople: summary.TotalPeople,
	}, nil
}

func (h *LibraryHandler) IssueLibraryKioskToken(ctx context.Context, _ api.IssueLibraryKioskTokenRequestObject) (api.IssueLibraryKioskTokenResponseObject, error) {
	token, expiresAt, err := h.service.IssueKioskVisitToken(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.IssueLibraryKioskToken201JSONResponse{Token: token, ExpiresAt: expiresAt}, nil
}

func (h *LibraryHandler) ScanLibraryKioskVisit(ctx context.Context, request api.ScanLibraryKioskVisitRequestObject) (api.ScanLibraryKioskVisitResponseObject, error) {
	v, err := h.service.ScanKioskVisit(ctx, tenantID(ctx), request.Body.Token, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScanLibraryKioskVisit200JSONResponse(toAPIVisit(v)), nil
}

func toAPIReadInPlace(p domain.ReadInPlace) api.LibraryReadInPlace {
	out := api.LibraryReadInPlace{Id: p.ID, CopyId: p.CopyID, StartedAt: p.StartedAt, EndedAt: p.EndedAt}
	if p.MemberUserID.Valid {
		id := openapi_types.UUID(p.MemberUserID.UUID)
		out.MemberUserId = &id
	}
	if p.VisitorName != "" {
		out.VisitorName = &p.VisitorName
	}
	return out
}

func (h *LibraryHandler) ListLibraryReadInPlace(ctx context.Context, request api.ListLibraryReadInPlaceRequestObject) (api.ListLibraryReadInPlaceResponseObject, error) {
	entries, err := h.service.ReadInPlaceHistory(ctx, tenantID(ctx), request.CopyId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryReadInPlace, len(entries))
	for i, e := range entries {
		data[i] = toAPIReadInPlace(e)
	}
	return api.ListLibraryReadInPlace200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) StartLibraryReadInPlace(ctx context.Context, request api.StartLibraryReadInPlaceRequestObject) (api.StartLibraryReadInPlaceResponseObject, error) {
	var memberID uuid.NullUUID
	visitorName := ""
	if request.Body != nil {
		if request.Body.MemberUserId != nil {
			memberID = uuid.NullUUID{UUID: *request.Body.MemberUserId, Valid: true}
		}
		visitorName = strOr(request.Body.VisitorName)
	}
	p, err := h.service.StartReadInPlace(ctx, tenantID(ctx), request.CopyId, memberID, visitorName, uuid.NullUUID{UUID: userID(ctx), Valid: true})
	if err != nil {
		return nil, mapError(err)
	}
	return api.StartLibraryReadInPlace201JSONResponse(toAPIReadInPlace(p)), nil
}
