package http

import (
	"bytes"
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func toAPIMemberType(t domain.MemberType) api.LibraryMemberType {
	out := api.LibraryMemberType{
		Id: t.ID, Name: t.Name, MaxLoanItems: t.MaxLoanItems, MaxLoanDays: t.MaxLoanDays, RenewalDays: t.RenewalDays,
		MaxRenewals: t.MaxRenewals, FineType: api.LibraryFineType(t.FineType), FinePerTenor: t.FinePerTenor,
		TenorDays: t.TenorDays, SuspendDays: t.SuspendDays, ValidityMonths: t.ValidityMonths,
	}
	if t.DefaultForRole != "" {
		role := api.LibraryMemberTypeDefaultForRole(t.DefaultForRole)
		out.DefaultForRole = &role
	}
	return out
}

func fromAPIMemberTypeWrite(b api.LibraryMemberTypeWrite) domain.MemberType {
	out := domain.MemberType{
		Name: b.Name, MaxLoanItems: b.MaxLoanItems, MaxLoanDays: b.MaxLoanDays, RenewalDays: b.RenewalDays,
		MaxRenewals: b.MaxRenewals, FineType: domain.FineType(b.FineType), FinePerTenor: b.FinePerTenor,
		TenorDays: b.TenorDays, SuspendDays: b.SuspendDays, ValidityMonths: b.ValidityMonths,
	}
	if b.DefaultForRole != nil {
		out.DefaultForRole = string(*b.DefaultForRole)
	}
	return out
}

func (h *LibraryHandler) ListLibraryMemberTypes(ctx context.Context, _ api.ListLibraryMemberTypesRequestObject) (api.ListLibraryMemberTypesResponseObject, error) {
	types, err := h.service.ListMemberTypes(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMemberType, len(types))
	for i, t := range types {
		data[i] = toAPIMemberType(t)
	}
	return api.ListLibraryMemberTypes200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryMemberType(ctx context.Context, request api.CreateLibraryMemberTypeRequestObject) (api.CreateLibraryMemberTypeResponseObject, error) {
	t, err := h.service.CreateMemberType(ctx, tenantID(ctx), fromAPIMemberTypeWrite(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryMemberType201JSONResponse(toAPIMemberType(t)), nil
}

func (h *LibraryHandler) UpdateLibraryMemberType(ctx context.Context, request api.UpdateLibraryMemberTypeRequestObject) (api.UpdateLibraryMemberTypeResponseObject, error) {
	in := fromAPIMemberTypeWrite(*request.Body)
	in.ID = request.MemberTypeId
	t, err := h.service.UpdateMemberType(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryMemberType200JSONResponse(toAPIMemberType(t)), nil
}

func (h *LibraryHandler) DeleteLibraryMemberType(ctx context.Context, request api.DeleteLibraryMemberTypeRequestObject) (api.DeleteLibraryMemberTypeResponseObject, error) {
	if err := h.service.DeleteMemberType(ctx, tenantID(ctx), request.MemberTypeId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryMemberType204Response{}, nil
}

func toAPIMember(m domain.Member) api.LibraryMember {
	out := api.LibraryMember{
		UserId: m.UserID, MemberNo: m.MemberNo, MemberTypeId: m.MemberTypeID, RegisteredOn: openapiDate(m.RegisteredOn),
		Status: api.LibraryMemberStatus(m.Status), LateReturnCount: m.LateReturnCount,
	}
	if m.ValidUntil != nil {
		d := openapiDate(*m.ValidUntil)
		out.ValidUntil = &d
	}
	if m.SuspendedUntil != nil {
		d := openapiDate(*m.SuspendedUntil)
		out.SuspendedUntil = &d
	}
	if m.Notes != "" {
		out.Notes = &m.Notes
	}
	return out
}

func (h *LibraryHandler) ListLibraryMembers(ctx context.Context, request api.ListLibraryMembersRequestObject) (api.ListLibraryMembersResponseObject, error) {
	in := service.ListMembersInput{
		Search: strOr(request.Params.Search), Limit: intOr(request.Params.Limit, 50), Offset: intOr(request.Params.Offset, 0),
	}
	if request.Params.Status != nil {
		in.Status = string(*request.Params.Status)
	}
	if request.Params.MemberTypeId != nil {
		in.MemberTypeID = uuid.NullUUID{UUID: *request.Params.MemberTypeId, Valid: true}
	}
	members, err := h.service.ListMembers(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMember, len(members))
	for i, m := range members {
		data[i] = toAPIMember(m)
	}
	return api.ListLibraryMembers200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) RegisterLibraryMember(ctx context.Context, request api.RegisterLibraryMemberRequestObject) (api.RegisterLibraryMemberResponseObject, error) {
	b := request.Body
	m, err := h.service.RegisterMember(ctx, tenantID(ctx), service.RegisterMemberInput{
		UserID: b.UserId, MemberTypeID: b.MemberTypeId, MemberNo: strOr(b.MemberNo), Notes: strOr(b.Notes),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.RegisterLibraryMember201JSONResponse(toAPIMember(m)), nil
}

func (h *LibraryHandler) BulkRegisterLibraryMembers(ctx context.Context, request api.BulkRegisterLibraryMembersRequestObject) (api.BulkRegisterLibraryMembersResponseObject, error) {
	b := request.Body
	var classID uuid.NullUUID
	if b.ClassId != nil {
		classID = uuid.NullUUID{UUID: *b.ClassId, Valid: true}
	}
	result, err := h.service.BulkRegisterByRole(ctx, tenantID(ctx), b.MemberTypeId, string(b.Role), classID)
	if err != nil {
		return nil, mapError(err)
	}
	registered := make([]api.LibraryMember, len(result.Registered))
	for i, m := range result.Registered {
		registered[i] = toAPIMember(m)
	}
	failed := make([]struct {
		Reason string `json:"reason"`
		UserId string `json:"user_id"`
	}, len(result.Failed))
	for i, f := range result.Failed {
		failed[i].UserId = f.Barcode
		failed[i].Reason = f.Reason
	}
	return api.BulkRegisterLibraryMembers200JSONResponse{Registered: registered, Failed: failed}, nil
}

func (h *LibraryHandler) GetLibraryMember(ctx context.Context, request api.GetLibraryMemberRequestObject) (api.GetLibraryMemberResponseObject, error) {
	m, err := h.service.GetMember(ctx, tenantID(ctx), request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryMember200JSONResponse(toAPIMember(m)), nil
}

func (h *LibraryHandler) UpdateLibraryMemberProfile(ctx context.Context, request api.UpdateLibraryMemberProfileRequestObject) (api.UpdateLibraryMemberProfileResponseObject, error) {
	b := request.Body
	var validUntil *time.Time
	if b.ValidUntil != nil {
		validUntil = &b.ValidUntil.Time
	}
	m, err := h.service.UpdateMemberProfile(ctx, tenantID(ctx), request.UserId, b.MemberTypeId, validUntil, strOr(b.Notes))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryMemberProfile200JSONResponse(toAPIMember(m)), nil
}

func (h *LibraryHandler) UpdateLibraryMemberStatus(ctx context.Context, request api.UpdateLibraryMemberStatusRequestObject) (api.UpdateLibraryMemberStatusResponseObject, error) {
	m, err := h.service.UpdateMemberStatus(ctx, tenantID(ctx), request.UserId, domain.MemberStatus(request.Body.Status))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryMemberStatus200JSONResponse(toAPIMember(m)), nil
}

func (h *LibraryHandler) ClearLibraryMember(ctx context.Context, request api.ClearLibraryMemberRequestObject) (api.ClearLibraryMemberResponseObject, error) {
	m, err := h.service.Clearance(ctx, tenantID(ctx), request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ClearLibraryMember200JSONResponse(toAPIMember(m)), nil
}

func (h *LibraryHandler) PrintLibraryClearanceLetter(ctx context.Context, request api.PrintLibraryClearanceLetterRequestObject) (api.PrintLibraryClearanceLetterResponseObject, error) {
	pdf, err := h.service.PrintClearanceLetter(ctx, tenantID(ctx), request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.PrintLibraryClearanceLetter200ApplicationpdfResponse{Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf))}, nil
}
