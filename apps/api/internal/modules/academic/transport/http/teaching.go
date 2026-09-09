package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
)

func (h *AcademicHandler) ListTeachingAssignments(ctx context.Context, request api.ListTeachingAssignmentsRequestObject) (api.ListTeachingAssignmentsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	assignments, total, err := h.service.ListTeachingAssignments(ctx, tenantID, request.Params.AcademicYearId, request.Params.TeacherUserId, request.Params.ClassId, toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.TeachingAssignment, len(assignments))
	for i, a := range assignments {
		data[i] = toAPITeachingAssignment(a)
	}
	return api.ListTeachingAssignments200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) CreateTeachingAssignment(ctx context.Context, request api.CreateTeachingAssignmentRequestObject) (api.CreateTeachingAssignmentResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	assignment, err := h.service.CreateTeachingAssignment(ctx, domain.TeachingAssignment{
		TenantID: tenantID, AcademicYearID: request.Body.AcademicYearId, TeacherUserID: request.Body.TeacherUserId,
		SubjectID: request.Body.SubjectId, ClassID: request.Body.ClassId,
	})
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateTeachingAssignment201JSONResponse(toAPITeachingAssignment(assignment)), nil
}

func (h *AcademicHandler) UpdateTeachingAssignment(ctx context.Context, request api.UpdateTeachingAssignmentRequestObject) (api.UpdateTeachingAssignmentResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	assignment, err := h.service.UpdateTeachingAssignment(ctx, tenantID, request.AssignmentId, request.Body.IsActive)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateTeachingAssignment200JSONResponse(toAPITeachingAssignment(assignment)), nil
}

func (h *AcademicHandler) DeleteTeachingAssignment(ctx context.Context, request api.DeleteTeachingAssignmentRequestObject) (api.DeleteTeachingAssignmentResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteTeachingAssignment(ctx, tenantID, request.AssignmentId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteTeachingAssignment204Response{}, nil
}

func (h *AcademicHandler) SyncTeacherAssignments(ctx context.Context, request api.SyncTeacherAssignmentsRequestObject) (api.SyncTeacherAssignmentsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	pairs := make([]service.SubjectClassPair, len(request.Body.Pairs))
	for i, p := range request.Body.Pairs {
		pairs[i] = service.SubjectClassPair{SubjectID: p.SubjectId, ClassID: p.ClassId}
	}
	assignments, err := h.service.SyncTeacherAssignments(ctx, tenantID, request.Body.AcademicYearId, request.Body.TeacherUserId, pairs)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.TeachingAssignment, len(assignments))
	for i, a := range assignments {
		data[i] = toAPITeachingAssignment(a)
	}
	return api.SyncTeacherAssignments200JSONResponse{Data: data}, nil
}

func toAPITeachingAssignment(a domain.TeachingAssignment) api.TeachingAssignment {
	return api.TeachingAssignment{
		Id: a.ID, AcademicYearId: a.AcademicYearID, TeacherUserId: a.TeacherUserID,
		SubjectId: a.SubjectID, ClassId: a.ClassID, IsActive: a.IsActive,
	}
}
