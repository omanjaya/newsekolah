package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func (h *AcademicHandler) ListClasses(ctx context.Context, request api.ListClassesRequestObject) (api.ListClassesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	classes, total, err := h.service.ListClasses(ctx, tenantID, request.Params.AcademicYearId, searchValue(request.Params.Search), request.Params.GradeLevelId, toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Class, len(classes))
	for i, c := range classes {
		data[i] = toAPIClass(c)
	}
	return api.ListClasses200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) CreateClass(ctx context.Context, request api.CreateClassRequestObject) (api.CreateClassResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	class, err := h.service.CreateClass(ctx, fromAPIClassInput(tenantID, uuid.UUID{}, *request.Body))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateClass201JSONResponse(toAPIClass(class)), nil
}

func (h *AcademicHandler) GetClass(ctx context.Context, request api.GetClassRequestObject) (api.GetClassResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	class, err := h.service.GetClass(ctx, tenantID, request.ClassId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.GetClass200JSONResponse(toAPIClass(class)), nil
}

func (h *AcademicHandler) UpdateClass(ctx context.Context, request api.UpdateClassRequestObject) (api.UpdateClassResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	class, err := h.service.UpdateClass(ctx, fromAPIClassInput(tenantID, request.ClassId, *request.Body))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateClass200JSONResponse(toAPIClass(class)), nil
}

func (h *AcademicHandler) DeleteClass(ctx context.Context, request api.DeleteClassRequestObject) (api.DeleteClassResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteClass(ctx, tenantID, request.ClassId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteClass204Response{}, nil
}

func (h *AcademicHandler) ListClassEnrollments(ctx context.Context, request api.ListClassEnrollmentsRequestObject) (api.ListClassEnrollmentsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	enrollments, total, err := h.service.ListEnrollmentsByClass(ctx, tenantID, request.ClassId, toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Enrollment, len(enrollments))
	for i, e := range enrollments {
		data[i] = toAPIEnrollment(e)
	}
	return api.ListClassEnrollments200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) AssignStudent(ctx context.Context, request api.AssignStudentRequestObject) (api.AssignStudentResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	class, err := h.service.GetClass(ctx, tenantID, request.ClassId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	enrollment, err := h.service.AssignStudent(ctx, tenantID, class.AcademicYearID, request.Body.StudentUserId, request.ClassId, toDate(request.Body.JoinedOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.AssignStudent201JSONResponse(toAPIEnrollment(enrollment)), nil
}

func (h *AcademicHandler) BulkAssignStudents(ctx context.Context, request api.BulkAssignStudentsRequestObject) (api.BulkAssignStudentsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	class, err := h.service.GetClass(ctx, tenantID, request.ClassId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	assigned, skipped, err := h.service.BulkAssignStudents(ctx, tenantID, class.AcademicYearID, request.ClassId, request.Body.StudentUserIds, toDate(request.Body.JoinedOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Enrollment, len(assigned))
	for i, e := range assigned {
		data[i] = toAPIEnrollment(e)
	}
	return api.BulkAssignStudents200JSONResponse{Assigned: data, Skipped: skipped}, nil
}

func (h *AcademicHandler) MoveStudent(ctx context.Context, request api.MoveStudentRequestObject) (api.MoveStudentResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	current, err := h.service.GetEnrollment(ctx, tenantID, request.EnrollmentId)
	if err != nil {
		return nil, mapDomainError(err)
	}
	enrollment, err := h.service.MoveStudent(ctx, tenantID, current.AcademicYearID, current.StudentUserID, request.Body.ToClassId, toDate(request.Body.EffectiveOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.MoveStudent201JSONResponse(toAPIEnrollment(enrollment)), nil
}

func (h *AcademicHandler) RemoveStudentFromClass(ctx context.Context, request api.RemoveStudentFromClassRequestObject) (api.RemoveStudentFromClassResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	enrollment, err := h.service.RemoveStudent(ctx, tenantID, request.EnrollmentId, toDate(request.Body.LeftOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.RemoveStudentFromClass200JSONResponse(toAPIEnrollment(enrollment)), nil
}

func (h *AcademicHandler) ListUnassignedStudents(ctx context.Context, request api.ListUnassignedStudentsRequestObject) (api.ListUnassignedStudentsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	students, total, err := h.service.ListUnassignedStudents(ctx, tenantID, request.YearId, searchValue(request.Params.Search), toPage(request.Params.Page, request.Params.PageSize))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.StudentSummary, len(students))
	for i, s := range students {
		data[i] = api.StudentSummary{Id: s.ID, Name: s.Name, Username: s.Username}
	}
	return api.ListUnassignedStudents200JSONResponse{Data: data, Page: toPageMeta(total, request.Params.Page, request.Params.PageSize)}, nil
}

func (h *AcademicHandler) PreviewPromotion(ctx context.Context, request api.PreviewPromotionRequestObject) (api.PreviewPromotionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	plan, err := h.service.PreviewPromotion(ctx, tenantID, request.Body.FromYearId, request.Body.ToYearId, fromAPIOverrides(request.Body.Overrides))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.PromotionPlanItem, len(plan))
	for i, item := range plan {
		data[i] = toAPIPromotionPlanItem(item)
	}
	return api.PreviewPromotion200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CommitPromotion(ctx context.Context, request api.CommitPromotionRequestObject) (api.CommitPromotionResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	result, err := h.service.CommitPromotion(ctx, tenantID, request.Body.FromYearId, request.Body.ToYearId, fromAPIOverrides(request.Body.Overrides), toDate(request.Body.EffectiveOn))
	if err != nil {
		return nil, mapDomainError(err)
	}
	applied := make([]api.PromotionPlanItem, len(result.Applied))
	for i, item := range result.Applied {
		applied[i] = toAPIPromotionPlanItem(item)
	}
	skipped := make([]api.PromotionPlanItem, len(result.Skipped))
	for i, item := range result.Skipped {
		skipped[i] = toAPIPromotionPlanItem(item)
	}
	return api.CommitPromotion200JSONResponse{Applied: applied, Skipped: skipped}, nil
}

func fromAPIClassInput(tenantID, id uuid.UUID, in api.ClassInput) domain.Class {
	var capacity *int32
	if in.Capacity != nil {
		c := int32(*in.Capacity) //nolint:gosec // bounded by schema minimum
		capacity = &c
	}
	return domain.Class{
		ID: id, TenantID: tenantID, AcademicYearID: in.AcademicYearId, GradeLevelID: in.GradeLevelId,
		TrackID: in.TrackId, Name: in.Name, RoomID: in.RoomId, Capacity: capacity, HomeroomTeacherID: in.HomeroomTeacherId,
	}
}

func toAPIClass(c domain.Class) api.Class {
	out := api.Class{Id: c.ID, AcademicYearId: c.AcademicYearID, GradeLevelId: c.GradeLevelID, Name: c.Name}
	out.TrackId = c.TrackID
	out.RoomId = c.RoomID
	out.HomeroomTeacherId = c.HomeroomTeacherID
	if c.Capacity != nil {
		v := int(*c.Capacity)
		out.Capacity = &v
	}
	return out
}

func toAPIEnrollment(e domain.Enrollment) api.Enrollment {
	out := api.Enrollment{
		Id: e.ID, AcademicYearId: e.AcademicYearID, StudentUserId: e.StudentUserID, ClassId: e.ClassID,
		Status: api.EnrollmentStatus(e.Status), JoinedOn: toAPIDate(e.JoinedOn), LeftOn: toAPIDatePtr(e.LeftOn),
	}
	// Only the roster read fills these; a write returns the row it just
	// created, where the caller already knows who the student is.
	if e.StudentName != "" {
		out.StudentName = &e.StudentName
	}
	if e.StudentNIS != "" {
		out.StudentNis = &e.StudentNIS
	}
	return out
}

func fromAPIOverrides(overrides *[]api.PromotionOverride) []domain.PromotionOverride {
	if overrides == nil {
		return nil
	}
	out := make([]domain.PromotionOverride, len(*overrides))
	for i, o := range *overrides {
		out[i] = domain.PromotionOverride{StudentUserID: o.StudentUserId, Action: string(o.Action), TargetClassID: o.TargetClassId}
	}
	return out
}

func toAPIPromotionPlanItem(item domain.PromotionPlanItem) api.PromotionPlanItem {
	return api.PromotionPlanItem{
		StudentUserId: item.StudentUserID, FromClassId: item.FromClassID,
		Action: api.PromotionAction(item.Action), TargetClassId: item.TargetClassID, Unresolved: item.Unresolved,
	}
}
