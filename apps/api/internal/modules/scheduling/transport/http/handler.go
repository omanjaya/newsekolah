// Package http implements scheduling's slice of the generated
// api.StrictServerInterface: request/response mapping only, no business
// rules and no SQL (both live in service/ and repository/), per
// docs/03-layered-architecture.md section 1.
package http

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type SchedulingHandler struct {
	service   *service.Service
	perms     authz.PermissionsProvider
	publisher service.EventPublisher
}

func New(svc *service.Service, perms authz.PermissionsProvider, publisher service.EventPublisher) *SchedulingHandler {
	return &SchedulingHandler{service: svc, perms: perms, publisher: publisher}
}

func tenantIDFromContext(ctx context.Context) uuid.UUID {
	if t, ok := tenant.FromContext(ctx); ok {
		return t.ID
	}
	return uuid.UUID{}
}

// actorFor resolves the caller's effective permissions into a
// service.Actor: CanManage is what lets the service tell an admin's write
// apart from a teacher's self-service one, per
// scheduling/service/schedule.go's Actor doc comment.
func (h *SchedulingHandler) actorFor(ctx context.Context, tenantID, userID uuid.UUID) (service.Actor, error) {
	perms, err := h.perms.EffectivePermissions(ctx, tenantID, userID)
	if err != nil {
		return service.Actor{}, httpx.ErrInternal
	}
	return service.Actor{UserID: userID, CanManage: perms.Has(authz.PermManageSchedules)}, nil
}

func (h *SchedulingHandler) canViewJournalsAll(ctx context.Context, tenantID, userID uuid.UUID) bool {
	perms, err := h.perms.EffectivePermissions(ctx, tenantID, userID)
	if err != nil {
		return false
	}
	return perms.Has(authz.PermViewJournalsAll)
}

// scheduleConflictClass and scheduleConflictTeacher are transport-local
// error codes: domain/errors.go's doc comment on ErrConflictClass /
// ErrConflictTeacher requires these exact codes, but they are specific
// enough to scheduling's 409 responses that they live here rather than in
// the shared internal/platform/httpx/errors.go every module touches.
var (
	errScheduleConflictClass   = httpx.NewError(http.StatusConflict, "SCHEDULE_CONFLICT_CLASS")
	errScheduleConflictTeacher = httpx.NewError(http.StatusConflict, "SCHEDULE_CONFLICT_TEACHER")
	errSubstitutionConflict    = httpx.NewError(http.StatusConflict, "SUBSTITUTION_CONFLICT")
	errJournalConflict         = httpx.NewError(http.StatusConflict, "JOURNAL_CONFLICT")
)

// mapScheduleError translates a scheduling/domain sentinel error into the
// stable *httpx.Error the API contract promises; anything unrecognized
// (a raw database error that escaped mapConstraintError, for instance)
// withConflictDetails names the schedule that stands in the way, so the
// reader is told what to go and look at rather than only that something
// clashed. IDs travel rather than names: the caller already resolves
// every one of them for the timetable it is drawing.
func withConflictDetails(base *httpx.Error, err error) error {
	var conflict *domain.ConflictError
	if !errors.As(err, &conflict) {
		return base
	}
	with := conflict.With
	return httpx.NewError(base.Status, base.Code).WithDetails(
		httpx.ErrorDetail{Field: "class_id", Code: with.ClassID.String()},
		httpx.ErrorDetail{Field: "subject_id", Code: with.SubjectID.String()},
		httpx.ErrorDetail{Field: "teacher_user_id", Code: with.TeacherUserID.String()},
		httpx.ErrorDetail{Field: "start_seq", Code: strconv.Itoa(int(with.StartSeq))},
		httpx.ErrorDetail{Field: "end_seq", Code: strconv.Itoa(int(with.EndSeq))},
	)
}

// becomes a generic 500 rather than leaking internals.
func mapScheduleError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrScheduleNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, domain.ErrConflictClass):
		return withConflictDetails(errScheduleConflictClass, err)
	case errors.Is(err, domain.ErrConflictTeacher):
		return withConflictDetails(errScheduleConflictTeacher, err)
	case errors.Is(err, domain.ErrTeacherEditForbidden), errors.Is(err, domain.ErrTeacherEditDeadline), errors.Is(err, domain.ErrAdminOnlySource):
		return httpx.ErrForbidden
	case errors.Is(err, domain.ErrInvalidPeriodRange), errors.Is(err, domain.ErrDayNotSchoolDay),
		errors.Is(err, domain.ErrTeacherNotAssigned), errors.Is(err, domain.ErrPeriodNotFound):
		return httpx.ErrValidation
	default:
		var appErr *httpx.Error
		if errors.As(err, &appErr) {
			return appErr
		}
		return httpx.Internal(err)
	}
}

func mapSubstitutionError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrSubstitutionNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, domain.ErrSubstitutionNotRequester), errors.Is(err, domain.ErrSubstitutionNotSubstitute):
		return httpx.ErrForbidden
	case errors.Is(err, domain.ErrSubstitutionDuplicateActive), errors.Is(err, domain.ErrSubstitutionNotPending),
		errors.Is(err, domain.ErrSubstitutionAlreadyResponded), errors.Is(err, domain.ErrSubstitutionScheduleMismatch):
		return errSubstitutionConflict
	case errors.Is(err, domain.ErrSubstituteIsRequester), errors.Is(err, domain.ErrSubstitutionWeekdayMismatch),
		errors.Is(err, domain.ErrSubstituteNotTeacher):
		return httpx.ErrValidation
	default:
		var appErr *httpx.Error
		if errors.As(err, &appErr) {
			return appErr
		}
		return httpx.Internal(err)
	}
}

func mapJournalError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrJournalNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, domain.ErrJournalNotOwner):
		return httpx.ErrForbidden
	case errors.Is(err, domain.ErrJournalDuplicate):
		return errJournalConflict
	case errors.Is(err, domain.ErrJournalMissingTopic), errors.Is(err, domain.ErrJournalMissingActivity), errors.Is(err, domain.ErrTeacherNotAssigned):
		return httpx.ErrValidation
	default:
		var appErr *httpx.Error
		if errors.As(err, &appErr) {
			return appErr
		}
		return httpx.Internal(err)
	}
}

func nullUUIDPtr(id uuid.NullUUID) *uuid.UUID {
	if !id.Valid {
		return nil
	}
	v := id.UUID
	return &v
}

func ptrNullUUID(id *uuid.UUID) uuid.NullUUID {
	if id == nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: *id, Valid: true}
}

func toAPIMutationPolicy(p service.MutationPolicy) *api.MutationPolicy {
	out := &api.MutationPolicy{CanEdit: p.CanEdit, CanDelete: p.CanDelete}
	if p.Reason != "" {
		reason := p.Reason
		out.Reason = &reason
	}
	return out
}

func toAPISchedule(s domain.Schedule, policy *service.MutationPolicy) api.Schedule {
	out := api.Schedule{
		Id:             s.ID,
		AcademicYearId: s.AcademicYearID,
		ClassId:        s.ClassID,
		SubjectId:      s.SubjectID,
		TeacherUserId:  s.TeacherUserID,
		DayOfWeek:      int(s.DayOfWeek),
		StartPeriodId:  s.StartPeriodID,
		EndPeriodId:    s.EndPeriodID,
		Source:         api.ScheduleSource(s.Source),
		CreatedAt:      s.CreatedAt,
		UpdatedAt:      s.UpdatedAt,
		TermId:         nullUUIDPtr(s.TermID),
		RoomId:         nullUUIDPtr(s.RoomID),
	}
	if s.Notes != "" {
		notes := s.Notes
		out.Notes = &notes
	}
	if policy != nil {
		out.MutationPolicy = toAPIMutationPolicy(*policy)
	}
	return out
}

func toAPIBlock(b domain.Block) api.ScheduleBlock {
	return api.ScheduleBlock{
		ScheduleIds:   b.ScheduleIDs,
		ClassId:       b.ClassID,
		SubjectId:     b.SubjectID,
		TeacherUserId: b.TeacherUserID,
		RoomId:        nullUUIDPtr(b.RoomID),
		DayOfWeek:     int(b.DayOfWeek),
		StartSeq:      int(b.StartSeq),
		EndSeq:        int(b.EndSeq),
		Source:        api.ScheduleSource(b.Source),
	}
}

func toAPISubstitution(s domain.Substitution) api.Substitution {
	out := api.Substitution{
		Id:               s.ID,
		AcademicYearId:   s.AcademicYearID,
		ScheduleId:       s.ScheduleID,
		Date:             openapi_types.Date{Time: s.Date},
		RequesterUserId:  s.RequesterUserID,
		SubstituteUserId: s.SubstituteUserID,
		Status:           api.SubstitutionStatus(s.Status),
		CreatedAt:        s.CreatedAt,
		RespondedAt:      s.RespondedAt,
	}
	if s.RequesterNote != "" {
		note := s.RequesterNote
		out.RequesterNote = &note
	}
	if s.ResponseNote != "" {
		note := s.ResponseNote
		out.ResponseNote = &note
	}
	return out
}

func toAPIJournal(j domain.Journal) api.Journal {
	out := api.Journal{
		Id:              j.ID,
		AcademicYearId:  j.AcademicYearID,
		TeacherUserId:   j.TeacherUserID,
		WrittenByUserId: j.WrittenByUserID,
		ClassId:         j.ClassID,
		SubjectId:       j.SubjectID,
		LessonDate:      openapi_types.Date{Time: j.LessonDate},
		Topic:           j.Topic,
		Activities:      j.Activities,
		CreatedAt:       j.CreatedAt,
		UpdatedAt:       j.UpdatedAt,
	}
	if j.Reflection != "" {
		reflection := j.Reflection
		out.Reflection = &reflection
	}
	return out
}
