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
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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

// tenantLocale resolves the current request's tenant to a locale
// reportdoc's FormatDate/PageLabel/EmptyRowsLabelFor understand ("id" or
// "en"), mirroring reports/transport/http's identically named helper: a
// report export renders in the tenant's own configured locale
// (tenants.locale), not the requester's Accept-Language header.
func tenantLocale(ctx context.Context) string {
	t, ok := tenant.FromContext(ctx)
	if !ok {
		return i18n.DefaultLocale
	}
	return i18n.FromTenantLocale(t.Locale)
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
	errJournalReportColumn     = httpx.NewError(http.StatusBadRequest, "JOURNAL_REPORT_UNKNOWN_COLUMN")

	// Each rule a schedule or substitution can break has its own code, so
	// the form can say which one instead of a bare VALIDATION_FAILED.
	errTeacherNotAssigned = httpx.NewError(http.StatusBadRequest, "ACADEMIC_TEACHER_NOT_ASSIGNED").
				WithDetails(httpx.ErrorDetail{Field: "teacher_user_id", Code: "NOT_ASSIGNED"})
	errPeriodRangeInvalid = httpx.NewError(http.StatusBadRequest, "PERIOD_RANGE_INVALID").
				WithDetails(httpx.ErrorDetail{Field: "end_period_id", Code: "BEFORE_START"})
	errScheduleDayNotSchoolDay = httpx.NewError(http.StatusBadRequest, "SCHEDULE_DAY_NOT_SCHOOL_DAY").
					WithDetails(httpx.ErrorDetail{Field: "day_of_week", Code: "NOT_SCHOOL_DAY"})
	errSchedulePeriodInvalid = httpx.NewError(http.StatusBadRequest, "SCHEDULE_PERIOD_INVALID").
					WithDetails(httpx.ErrorDetail{Field: "start_period_id", Code: "INVALID"})
	errSubstitutionWeekdayMismatch = httpx.NewError(http.StatusBadRequest, "SUBSTITUTION_WEEKDAY_MISMATCH").
					WithDetails(httpx.ErrorDetail{Field: "date", Code: "WEEKDAY_MISMATCH"})
	errSubstitutionDateInPast = httpx.NewError(http.StatusBadRequest, "SUBSTITUTION_DATE_IN_PAST").
					WithDetails(httpx.ErrorDetail{Field: "date", Code: "DATE_IN_PAST"})
	errSubstitutionNotSchoolDay = httpx.NewError(http.StatusBadRequest, "SUBSTITUTION_NOT_SCHOOL_DAY").
					WithDetails(httpx.ErrorDetail{Field: "date", Code: "NOT_SCHOOL_DAY"})
	errSubstituteIsRequester = httpx.NewError(http.StatusBadRequest, "SUBSTITUTE_IS_REQUESTER").
					WithDetails(httpx.ErrorDetail{Field: "substitute_user_id", Code: "IS_REQUESTER"})
	errSubstituteNotTeacher = httpx.NewError(http.StatusBadRequest, "SUBSTITUTE_NOT_TEACHER").
				WithDetails(httpx.ErrorDetail{Field: "substitute_user_id", Code: "NOT_TEACHER"})
	errSubstitutionLessonNotOnDate = httpx.NewError(http.StatusBadRequest, "SUBSTITUTION_LESSON_NOT_ON_DATE").
					WithDetails(httpx.ErrorDetail{Field: "date", Code: "NOT_ON_TIMETABLE"})

	// Effective dating: a change to a lesson with history takes effect
	// from a date, never in the past nor over what was recorded.
	errScheduleEffectiveFromInvalid = httpx.NewError(http.StatusBadRequest, "SCHEDULE_EFFECTIVE_FROM_INVALID").
					WithDetails(httpx.ErrorDetail{Field: "effective_from", Code: "OUT_OF_YEAR"})
	errScheduleEnded = httpx.NewError(http.StatusConflict, "SCHEDULE_ENDED")
)

// withMinEffectiveFrom names the earliest effective_from the server would
// accept, so the editor can offer it: SCHEDULE_HAS_HISTORY (an undated
// change, code REQUIRED) and SCHEDULE_CHANGE_BEFORE_HISTORY (a date too
// early, code BEFORE_MIN). Without a known date (a race the database
// caught) the error goes out bare.
func withMinEffectiveFrom(status int, code, detailCode string, earliest *time.Time) error {
	out := httpx.NewError(status, code)
	if earliest == nil {
		return out
	}
	return out.WithDetails(httpx.ErrorDetail{Field: "effective_from", Code: detailCode, Message: earliest.Format(time.DateOnly)})
}

// minEffectiveFrom reads the earliest date a typed history error carries.
func minEffectiveFrom(err error) *time.Time {
	var needsDate *domain.HistoryRequiresDateError
	if errors.As(err, &needsDate) {
		return &needsDate.Min
	}
	var tooEarly *domain.ChangeTooEarlyError
	if errors.As(err, &tooEarly) {
		return &tooEarly.Min
	}
	return nil
}

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
	details := []httpx.ErrorDetail{
		{Field: "class_id", Code: with.ClassID.String(), Message: conflict.ClassName},
		{Field: "subject_id", Code: with.SubjectID.String(), Message: conflict.SubjectName},
		{Field: "teacher_user_id", Code: with.TeacherUserID.String(), Message: conflict.TeacherName},
		{Field: "start_seq", Code: strconv.Itoa(int(with.StartSeq)), Message: conflict.StartPeriodName},
		{Field: "end_seq", Code: strconv.Itoa(int(with.EndSeq)), Message: conflict.EndPeriodName},
	}
	// The clashing version's dates let the editor say "until 26 Nov" when
	// the slot frees up later.
	if !with.EffectiveFrom.IsZero() {
		details = append(details, httpx.ErrorDetail{Field: "effective_from", Code: with.EffectiveFrom.Format(time.DateOnly)})
	}
	if with.EffectiveUntil != nil {
		details = append(details, httpx.ErrorDetail{Field: "effective_until", Code: with.EffectiveUntil.Format(time.DateOnly)})
	}
	return httpx.NewError(base.Status, base.Code).WithDetails(details...)
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
	case errors.Is(err, domain.ErrTeacherNotAssigned):
		return errTeacherNotAssigned
	case errors.Is(err, domain.ErrInvalidPeriodRange):
		return errPeriodRangeInvalid
	case errors.Is(err, domain.ErrDayNotSchoolDay):
		return errScheduleDayNotSchoolDay
	case errors.Is(err, domain.ErrPeriodNotFound), errors.Is(err, domain.ErrPeriodIsBreak), errors.Is(err, domain.ErrPeriodTemplateDay):
		return errSchedulePeriodInvalid
	case errors.Is(err, domain.ErrScheduleHasHistory):
		return withMinEffectiveFrom(http.StatusConflict, "SCHEDULE_HAS_HISTORY", "REQUIRED", minEffectiveFrom(err))
	case errors.Is(err, domain.ErrScheduleChangeBeforeHistory):
		return withMinEffectiveFrom(http.StatusConflict, "SCHEDULE_CHANGE_BEFORE_HISTORY", "BEFORE_MIN", minEffectiveFrom(err))
	case errors.Is(err, domain.ErrEffectiveFromOutOfYear):
		return errScheduleEffectiveFromInvalid
	case errors.Is(err, domain.ErrScheduleEnded):
		return errScheduleEnded
	case errors.Is(err, domain.ErrEffectiveDateAdminOnly):
		return httpx.ErrForbidden
	case errors.Is(err, domain.ErrInvalidScheduleBlock):
		return httpx.ErrValidation
	case errors.Is(err, domain.ErrYearArchived):
		return httpx.WrapError(409, "SCHEDULE_YEAR_ARCHIVED", err)
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
	case errors.Is(err, domain.ErrSubstitutionWeekdayMismatch):
		return errSubstitutionWeekdayMismatch
	case errors.Is(err, domain.ErrSubstitutionDateInPast):
		return errSubstitutionDateInPast
	case errors.Is(err, domain.ErrSubstitutionNotSchoolDay):
		return errSubstitutionNotSchoolDay
	case errors.Is(err, domain.ErrSubstituteIsRequester):
		return errSubstituteIsRequester
	case errors.Is(err, domain.ErrSubstituteNotTeacher):
		return errSubstituteNotTeacher
	case errors.Is(err, domain.ErrSubstitutionNotScheduled):
		return errSubstitutionLessonNotOnDate
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
	case errors.Is(err, domain.ErrTeacherNotAssigned):
		return errTeacherNotAssigned
	case errors.Is(err, domain.ErrJournalMissingTopic), errors.Is(err, domain.ErrJournalMissingActivity):
		return httpx.ErrValidation
	case errors.Is(err, reportdoc.ErrUnknownColumn):
		return errJournalReportColumn
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
	if p.HasHistory {
		hasHistory := true
		out.HasHistory = &hasHistory
	}
	if p.RequiresEffectiveFrom {
		requires := true
		out.RequiresEffectiveFrom = &requires
	}
	out.MinEffectiveFrom = apiDatePtr(p.MinEffectiveFrom)
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
		EffectiveFrom:  openapi_types.Date{Time: s.EffectiveFrom},
		EffectiveUntil: apiDatePtr(s.EffectiveUntil),
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

func toAPIBlock(b service.ListedBlock) api.ScheduleBlock {
	var hasHistory *bool
	if b.HasHistory {
		hasHistory = &b.HasHistory
	}
	out := api.ScheduleBlock{
		HasHistory:     hasHistory,
		ScheduleIds:    b.ScheduleIDs,
		ClassId:        b.ClassID,
		SubjectId:      b.SubjectID,
		TeacherUserId:  b.TeacherUserID,
		RoomId:         nullUUIDPtr(b.RoomID),
		DayOfWeek:      int(b.DayOfWeek),
		StartSeq:       int(b.StartSeq),
		EndSeq:         int(b.EndSeq),
		Source:         api.ScheduleSource(b.Source),
		EffectiveFrom:  openapi_types.Date{Time: b.EffectiveFrom},
		EffectiveUntil: apiDatePtr(b.EffectiveUntil),
	}
	if b.Policy != nil {
		out.MutationPolicy = toAPIMutationPolicy(*b.Policy)
	}
	return out
}

func apiDatePtr(t *time.Time) *openapi_types.Date {
	if t == nil {
		return nil
	}
	return &openapi_types.Date{Time: *t}
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

// toAPISubstitutionWithSchedule is toAPISubstitution plus the class/subject/
// period the enriched incoming/outgoing list scopes join in (see
// domain.SubstitutionWithSchedule).
func toAPISubstitutionWithSchedule(s domain.SubstitutionWithSchedule) api.Substitution {
	out := toAPISubstitution(s.Substitution)
	out.ClassId = &s.ClassID
	out.SubjectId = &s.SubjectID
	out.StartPeriodId = &s.StartPeriodID
	out.EndPeriodId = &s.EndPeriodID
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
