package http

import (
	"context"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// toDayOfWeek narrows the wire int to the domain's int16 only after
// bounds-checking it against the schema's own 1..7 range: the OpenAPI
// minimum/maximum in scheduling.yaml is not enforced by any request
// validation middleware (see cmd/api/wire.go), so an out-of-range or
// otherwise oversized value must be rejected here rather than silently
// truncated by the int->int16 conversion.
func toDayOfWeek(v int) (int16, error) {
	if v < 1 || v > 7 {
		return 0, httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "day_of_week", Code: "OUT_OF_RANGE"})
	}
	return int16(v), nil
}

func searchValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func toScheduleInput(body api.ScheduleWriteRequest) (service.ScheduleInput, error) {
	dayOfWeek, err := toDayOfWeek(body.DayOfWeek)
	if err != nil {
		return service.ScheduleInput{}, err
	}

	in := service.ScheduleInput{
		AcademicYearID: body.AcademicYearId,
		TermID:         ptrNullUUID(body.TermId),
		ClassID:        body.ClassId,
		SubjectID:      body.SubjectId,
		TeacherUserID:  body.TeacherUserId,
		RoomID:         ptrNullUUID(body.RoomId),
		DayOfWeek:      dayOfWeek,
		StartPeriodID:  body.StartPeriodId,
		EndPeriodID:    body.EndPeriodId,
	}
	if body.Source != nil {
		in.Source = domain.Source(*body.Source)
	}
	if body.Notes != nil {
		in.Notes = *body.Notes
	}
	in.EffectiveFrom = datePtr(body.EffectiveFrom)
	return in, nil
}

// datePtr unwraps an optional wire date into the calendar date the
// service compares (midnight UTC).
func datePtr(d *openapi_types.Date) *time.Time {
	if d == nil {
		return nil
	}
	t := d.Time
	return &t
}

func (h *SchedulingHandler) ListSchedules(ctx context.Context, request api.ListSchedulesRequestObject) (api.ListSchedulesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	scope, err := h.resolveViewScope(ctx, tenantID, userID, params.AcademicYearId)
	if err != nil {
		return nil, err
	}

	// A day filter combines with class_id or teacher_user_id when both are
	// given (e.g. a student's "today" request: class_id + day_of_week).
	query := service.BlockQuery{AcademicYearID: params.AcademicYearId, AsOf: datePtr(params.AsOf)}
	if params.DayOfWeek != nil {
		d, dayErr := toDayOfWeek(*params.DayOfWeek)
		if dayErr != nil {
			return nil, dayErr
		}
		query.DayOfWeek = &d
	}

	switch {
	case params.ClassId != nil:
		if !scope.canViewClass(*params.ClassId) {
			return nil, httpx.ErrForbidden
		}
		query.ClassID = uuid.NullUUID{UUID: *params.ClassId, Valid: true}
	case params.TeacherUserId != nil:
		if !scope.canViewTeacher(*params.TeacherUserId) {
			return nil, httpx.ErrForbidden
		}
		query.TeacherUserID = uuid.NullUUID{UUID: *params.TeacherUserId, Valid: true}
	case query.DayOfWeek != nil:
		if !scope.fullAccess {
			return nil, httpx.ErrForbidden
		}
	default:
		return nil, httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "class_id", Code: "REQUIRED"})
	}

	list, err := h.service.ListBlocks(ctx, tenantID, query, service.Actor{UserID: userID, CanManage: scope.canManage})
	if err != nil {
		return nil, mapScheduleError(err)
	}
	blocks := list.Blocks
	if query.ClassID.Valid {
		blocks = scope.filterOwnTeacher(blocks)
	}

	data := make([]api.ScheduleBlock, len(blocks))
	for i, b := range blocks {
		data[i] = toAPIBlock(b)
	}
	return api.ListSchedules200JSONResponse{Data: data, WeekStartsOn: openapi_types.Date{Time: list.WeekStart}}, nil
}

// viewScope is who is reading the schedule grid and what they may see,
// resolved once per request from the caller's effective permissions and
// (for a caller with neither) their student or teacher standing in
// academicYearID. Mirrors teaching_schedules.go's student/teacher-owner
// scoping in the old app, extended with the view_reports/manage_attendance
// exception a plain permission check can express that per-request SQL
// filtering in the old app never needed to.
type viewScope struct {
	fullAccess bool // manage_schedules, view_reports, or manage_attendance: no restriction
	canManage  bool // manage_schedules: the grid also carries each block's mutation policy
	userID     uuid.UUID
	isTeacher  bool
	isStudent  bool
	ownClassID uuid.UUID
}

func (v viewScope) canViewClass(classID uuid.UUID) bool {
	switch {
	case v.fullAccess:
		return true
	case v.isStudent:
		return classID == v.ownClassID
	case v.isTeacher:
		return true // filtered to their own blocks by filterOwnTeacher
	default:
		return false
	}
}

// canViewSchedule is the single-schedule equivalent of canViewClass plus
// filterOwnTeacher: GetSchedule has no list to filter, so it checks the
// one schedule's own class/teacher directly against the same scope rules.
func (v viewScope) canViewSchedule(classID, teacherUserID uuid.UUID) bool {
	switch {
	case v.fullAccess:
		return true
	case v.isStudent:
		return classID == v.ownClassID
	case v.isTeacher:
		return teacherUserID == v.userID
	default:
		return false
	}
}

func (v viewScope) canViewTeacher(teacherUserID uuid.UUID) bool {
	if v.fullAccess {
		return true
	}
	return v.isTeacher && teacherUserID == v.userID
}

// filterOwnTeacher narrows a class's full block list down to the caller's
// own lessons in it, for a teacher without fullAccess: they may look at
// any class (canViewClass always allows it), but only see the part of its
// timetable they teach.
func (v viewScope) filterOwnTeacher(blocks []service.ListedBlock) []service.ListedBlock {
	if v.fullAccess || !v.isTeacher {
		return blocks
	}
	out := make([]service.ListedBlock, 0, len(blocks))
	for _, b := range blocks {
		if b.TeacherUserID == v.userID {
			out = append(out, b)
		}
	}
	return out
}

func (h *SchedulingHandler) resolveViewScope(ctx context.Context, tenantID, userID, academicYearID uuid.UUID) (viewScope, error) {
	perms, err := h.perms.EffectivePermissions(ctx, tenantID, userID)
	if err != nil {
		return viewScope{}, httpx.ErrInternal
	}
	if perms.Has(authz.PermManageSchedules) || perms.Has(authz.PermViewReports) || perms.Has(authz.PermManageAttendance) {
		return viewScope{fullAccess: true, canManage: perms.Has(authz.PermManageSchedules)}, nil
	}

	scope := viewScope{userID: userID}
	if classID, ok, err := h.service.StudentActiveClassID(ctx, tenantID, academicYearID, userID); err == nil && ok {
		scope.isStudent = true
		scope.ownClassID = classID
		return scope, nil
	}
	if ok, err := h.service.IsActiveTeacherInYear(ctx, tenantID, academicYearID, userID); err == nil && ok {
		scope.isTeacher = true
	}
	return scope, nil
}

func (h *SchedulingHandler) ListTeacherOptions(ctx context.Context, request api.ListTeacherOptionsRequestObject) (api.ListTeacherOptionsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	params := request.Params

	perms, err := h.perms.EffectivePermissions(ctx, tenantID, userID)
	if err != nil {
		return nil, httpx.ErrInternal
	}
	fullAccess := perms.Has(authz.PermManageSchedules) || perms.Has(authz.PermManageMasterData)

	selfUserID := uuid.NullUUID{}
	if !fullAccess {
		ok, err := h.service.IsActiveTeacherInYear(ctx, tenantID, params.AcademicYearId, userID)
		if err != nil {
			return nil, mapScheduleError(err)
		}
		if !ok {
			return nil, httpx.ErrForbidden
		}
		selfUserID = uuid.NullUUID{UUID: userID, Valid: true}
	}

	limit := int32(20)
	if params.Limit != nil {
		limit = int32(*params.Limit) //nolint:gosec // bounded by the OpenAPI schema's minimum/maximum
	}
	options, err := h.service.ListTeacherOptions(ctx, tenantID, params.AcademicYearId, searchValue(params.Search), selfUserID, limit)
	if err != nil {
		return nil, mapScheduleError(err)
	}
	data := make([]api.UserOption, len(options))
	for i, o := range options {
		data[i] = api.UserOption{Id: o.ID, Name: o.Name}
	}
	return api.ListTeacherOptions200JSONResponse{Data: data}, nil
}

func (h *SchedulingHandler) CreateSchedule(ctx context.Context, request api.CreateScheduleRequestObject) (api.CreateScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	in, err := toScheduleInput(*request.Body)
	if err != nil {
		return nil, err
	}
	created, err := h.service.CreateSchedule(ctx, tenantID, in, actor)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	policy := h.service.MutationPolicyFor(ctx, tenantID, created, actor)
	return api.CreateSchedule201JSONResponse(toAPISchedule(created, &policy)), nil
}

func (h *SchedulingHandler) BulkImportSchedules(ctx context.Context, request api.BulkImportSchedulesRequestObject) (api.BulkImportSchedulesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)

	inputs := make([]service.ScheduleInput, len(request.Body.Schedules))
	for i, s := range request.Body.Schedules {
		in, err := toScheduleInput(s)
		if err != nil {
			return nil, err
		}
		inputs[i] = in
	}

	created, err := h.service.BulkImport(ctx, tenantID, inputs)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	data := make([]api.Schedule, len(created))
	for i, s := range created {
		data[i] = toAPISchedule(s, nil)
	}
	return api.BulkImportSchedules201JSONResponse{Data: data}, nil
}

func (h *SchedulingHandler) ClearSchedules(ctx context.Context, request api.ClearSchedulesRequestObject) (api.ClearSchedulesResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)
	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	if err := h.service.ClearAcademicYear(ctx, tenantID, request.Body.AcademicYearId, datePtr(request.Body.EffectiveFrom), actor); err != nil {
		return nil, mapScheduleError(err)
	}
	return api.ClearSchedules204Response{}, nil
}

func (h *SchedulingHandler) GetSchedule(ctx context.Context, request api.GetScheduleRequestObject) (api.GetScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	sched, err := h.service.GetSchedule(ctx, tenantID, request.ScheduleId)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	scope, err := h.resolveViewScope(ctx, tenantID, userID, sched.AcademicYearID)
	if err != nil {
		return nil, err
	}
	if !scope.canViewSchedule(sched.ClassID, sched.TeacherUserID) {
		return nil, httpx.ErrForbidden
	}

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}
	policy := h.service.MutationPolicyFor(ctx, tenantID, sched, actor)
	return api.GetSchedule200JSONResponse(toAPISchedule(sched, &policy)), nil
}

func (h *SchedulingHandler) UpdateSchedule(ctx context.Context, request api.UpdateScheduleRequestObject) (api.UpdateScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	in, err := toScheduleInput(*request.Body)
	if err != nil {
		return nil, err
	}
	ids := []uuid.UUID{request.ScheduleId}
	if request.Params.ScheduleIds != nil {
		ids = *request.Params.ScheduleIds
	}
	updated, err := h.service.UpdateScheduleBlock(ctx, tenantID, request.ScheduleId, ids, in, actor)
	if err != nil {
		return nil, mapScheduleError(err)
	}

	policy := h.service.MutationPolicyFor(ctx, tenantID, updated, actor)
	return api.UpdateSchedule200JSONResponse(toAPISchedule(updated, &policy)), nil
}

func (h *SchedulingHandler) DeleteSchedule(ctx context.Context, request api.DeleteScheduleRequestObject) (api.DeleteScheduleResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	userID, _ := httpx.UserIDFromContext(ctx)

	actor, err := h.actorFor(ctx, tenantID, userID)
	if err != nil {
		return nil, err
	}

	ids := []uuid.UUID{request.ScheduleId}
	if request.Params.ScheduleIds != nil {
		ids = *request.Params.ScheduleIds
	}
	if err := h.service.DeleteScheduleBlock(ctx, tenantID, request.ScheduleId, ids, datePtr(request.Params.EffectiveFrom), actor); err != nil {
		return nil, mapScheduleError(err)
	}
	return api.DeleteSchedule204Response{}, nil
}
