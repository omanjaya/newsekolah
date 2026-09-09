package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func (h *AcademicHandler) ListSubjects(ctx context.Context, request api.ListSubjectsRequestObject) (api.ListSubjectsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	subjects, total, err := h.service.ListSubjects(ctx, tenantID, searchValue(request.Params.Search), toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Subject, len(subjects))
	for i, s := range subjects {
		data[i] = api.Subject{Id: s.ID, Code: s.Code, Name: s.Name}
	}
	return api.ListSubjects200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) CreateSubject(ctx context.Context, request api.CreateSubjectRequestObject) (api.CreateSubjectResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	subject, err := h.service.CreateSubject(ctx, tenantID, request.Body.Code, request.Body.Name)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateSubject201JSONResponse{Id: subject.ID, Code: subject.Code, Name: subject.Name}, nil
}

func (h *AcademicHandler) UpdateSubject(ctx context.Context, request api.UpdateSubjectRequestObject) (api.UpdateSubjectResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	subject, err := h.service.UpdateSubject(ctx, tenantID, request.SubjectId, request.Body.Code, request.Body.Name)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateSubject200JSONResponse{Id: subject.ID, Code: subject.Code, Name: subject.Name}, nil
}

func (h *AcademicHandler) DeleteSubject(ctx context.Context, request api.DeleteSubjectRequestObject) (api.DeleteSubjectResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteSubject(ctx, tenantID, request.SubjectId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteSubject204Response{}, nil
}

func (h *AcademicHandler) ListSubjectOfferings(ctx context.Context, request api.ListSubjectOfferingsRequestObject) (api.ListSubjectOfferingsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	offerings, err := h.service.ListSubjectOfferings(ctx, tenantID, request.YearId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.SubjectOffering, len(offerings))
	for i, o := range offerings {
		data[i] = toAPISubjectOffering(o)
	}
	return api.ListSubjectOfferings200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CreateSubjectOffering(ctx context.Context, request api.CreateSubjectOfferingRequestObject) (api.CreateSubjectOfferingResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	offering, err := h.service.CreateSubjectOffering(ctx, domain.SubjectOffering{
		TenantID: tenantID, AcademicYearID: request.YearId, SubjectID: request.Body.SubjectId,
		GradeLevelID: request.Body.GradeLevelId, HoursPerWeek: int16(request.Body.HoursPerWeek), //nolint:gosec // bounded by schema minimum
	})
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateSubjectOffering201JSONResponse(toAPISubjectOffering(offering)), nil
}

func (h *AcademicHandler) UpdateSubjectOffering(ctx context.Context, request api.UpdateSubjectOfferingRequestObject) (api.UpdateSubjectOfferingResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	offering, err := h.service.UpdateSubjectOffering(ctx, tenantID, request.OfferingId, request.Body.GradeLevelId, int16(request.Body.HoursPerWeek)) //nolint:gosec // bounded by schema minimum
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateSubjectOffering200JSONResponse(toAPISubjectOffering(offering)), nil
}

func (h *AcademicHandler) DeleteSubjectOffering(ctx context.Context, request api.DeleteSubjectOfferingRequestObject) (api.DeleteSubjectOfferingResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteSubjectOffering(ctx, tenantID, request.OfferingId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteSubjectOffering204Response{}, nil
}

func (h *AcademicHandler) ListRooms(ctx context.Context, request api.ListRoomsRequestObject) (api.ListRoomsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	rooms, total, err := h.service.ListRooms(ctx, tenantID, searchValue(request.Params.Search), toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Room, len(rooms))
	for i, r := range rooms {
		data[i] = toAPIRoom(r)
	}
	return api.ListRooms200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) CreateRoom(ctx context.Context, request api.CreateRoomRequestObject) (api.CreateRoomResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	var capacity *int32
	if request.Body.Capacity != nil {
		c := int32(*request.Body.Capacity) //nolint:gosec // bounded by schema minimum
		capacity = &c
	}
	room, err := h.service.CreateRoom(ctx, tenantID, request.Body.Code, request.Body.Name, capacity)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateRoom201JSONResponse(toAPIRoom(room)), nil
}

func (h *AcademicHandler) UpdateRoom(ctx context.Context, request api.UpdateRoomRequestObject) (api.UpdateRoomResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	var capacity *int32
	if request.Body.Capacity != nil {
		c := int32(*request.Body.Capacity) //nolint:gosec // bounded by schema minimum
		capacity = &c
	}
	room, err := h.service.UpdateRoom(ctx, tenantID, request.RoomId, request.Body.Code, request.Body.Name, capacity)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateRoom200JSONResponse(toAPIRoom(room)), nil
}

func (h *AcademicHandler) DeleteRoom(ctx context.Context, request api.DeleteRoomRequestObject) (api.DeleteRoomResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteRoom(ctx, tenantID, request.RoomId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteRoom204Response{}, nil
}

func toAPISubjectOffering(o domain.SubjectOffering) api.SubjectOffering {
	out := api.SubjectOffering{Id: o.ID, AcademicYearId: o.AcademicYearID, SubjectId: o.SubjectID, HoursPerWeek: int(o.HoursPerWeek)}
	out.GradeLevelId = o.GradeLevelID
	return out
}

func toAPIRoom(r domain.Room) api.Room {
	out := api.Room{Id: r.ID, Code: r.Code, Name: r.Name}
	if r.Capacity != nil {
		v := int(*r.Capacity)
		out.Capacity = &v
	}
	return out
}
