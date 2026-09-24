// Package http implements academic's slice of the generated
// api.StrictServerInterface: request/response mapping only. Business rules
// live in service/, SQL in repository/, per
// docs/03-layered-architecture.md section 1.
package http

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type AcademicHandler struct {
	service *service.Service
	clock   clock.Clock
}

func New(svc *service.Service, clk clock.Clock) *AcademicHandler {
	return &AcademicHandler{service: svc, clock: clk}
}

func tenantIDFromContext(ctx context.Context) uuid.UUID {
	if t, ok := tenant.FromContext(ctx); ok {
		return t.ID
	}
	return uuid.UUID{}
}

// tenantNow resolves the current instant in the tenant's own timezone,
// falling back to UTC if the tenant's timezone is missing or invalid --
// used only by GetPeriodToday, the one endpoint the scope calls out as
// needing the tenant's local wall-clock time.
func (h *AcademicHandler) tenantNow(ctx context.Context) time.Time {
	now := h.clock.Now()
	t, ok := tenant.FromContext(ctx)
	if !ok || t.Timezone == "" {
		return now
	}
	loc, err := time.LoadLocation(t.Timezone)
	if err != nil {
		return now
	}
	return now.In(loc)
}

// isoWeekday converts Go's Sunday=0 weekday to the ISO-8601 Monday=1..Sunday=7
// convention this module's day_of_week columns use.
func isoWeekday(t time.Time) int16 {
	if t.Weekday() == time.Sunday {
		return domain.WeekdaySunday
	}
	return int16(t.Weekday()) //nolint:gosec // time.Weekday is 0-6, always fits in int16
}

// notFoundErrs maps to a plain 404: the caller doesn't need a specific
// code, just confirmation the resource isn't there.
var notFoundErrs = []error{
	domain.ErrAcademicYearNotFound,
	domain.ErrTermNotFound,
	domain.ErrCalendarEventNotFound,
	domain.ErrNewYearSourceNotFound,
	domain.ErrGradeLevelNotFound,
	domain.ErrTrackNotFound,
	domain.ErrClassNotFound,
	domain.ErrSubjectNotFound,
	domain.ErrRoomNotFound,
	domain.ErrPeriodTemplateNotFound,
	domain.ErrPeriodNotFound,
	domain.ErrTeachingAssignmentNotFound,
	domain.ErrEnrollmentNotOpen,
}

// conflictErrs maps to a 409 with the stable code the OpenAPI spec and
// i18n/messages_academic.go both key off.
var conflictErrs = []struct {
	err  error
	code string
}{
	{domain.ErrAcademicYearNameExists, "ACADEMIC_YEAR_NAME_EXISTS"},
	{domain.ErrAcademicYearArchived, "ACADEMIC_YEAR_ARCHIVED"},
	{domain.ErrTermSequenceTaken, "ACADEMIC_TERM_SEQUENCE_TAKEN"},
	{domain.ErrGradeLevelCodeExists, "ACADEMIC_CODE_EXISTS"},
	{domain.ErrTrackCodeExists, "ACADEMIC_CODE_EXISTS"},
	{domain.ErrClassNameExists, "ACADEMIC_CLASS_NAME_EXISTS"},
	{domain.ErrHasDependents, "ACADEMIC_HAS_DEPENDENTS"},
	{domain.ErrEnrollmentExists, "ACADEMIC_ENROLLMENT_EXISTS"},
	{domain.ErrSubjectCodeExists, "ACADEMIC_CODE_EXISTS"},
	{domain.ErrRoomCodeExists, "ACADEMIC_CODE_EXISTS"},
	{domain.ErrSubjectOfferingExists, "ACADEMIC_OFFERING_EXISTS"},
	{domain.ErrPeriodSequenceTaken, "ACADEMIC_PERIOD_SEQUENCE_TAKEN"},
	{domain.ErrTeachingAssignmentExists, "ACADEMIC_TEACHING_ASSIGNMENT_EXISTS"},
	{domain.ErrTeacherNotAssigned, "ACADEMIC_TEACHER_NOT_ASSIGNED"},
}

// validationErrs maps to a plain 400: the request shape was fine but a
// field value violates a domain rule.
var validationErrs = []error{
	domain.ErrInvalidPeriod,
	domain.ErrInvalidDayOfWeek,
	domain.ErrUnknownTemplate,
	domain.ErrInvalidCalendarEventRange,
	domain.ErrNewYearSameAsSource,
	domain.ErrStudentNotActive,
	domain.ErrTeacherNotActive,
	domain.ErrSubjectNotOfferedInYear,
	domain.ErrClassYearMismatch,
	domain.ErrTooManyClasses,
	domain.ErrImportRowInvalid,
	domain.ErrImportHasInvalidRow,
	domain.ErrFieldTooLong,
	domain.ErrInvalidScope,
	reportdoc.ErrUnknownColumn,
}

// mapDomainError maps a domain sentinel error to a stable httpx.Error; any
// error already an *httpx.Error (or unrecognized) passes through so the
// central error handler renders it.
func mapDomainError(err error) error {
	if err == nil {
		return nil
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}

	for _, e := range notFoundErrs {
		if errors.Is(err, e) {
			return httpx.ErrNotFound
		}
	}
	for _, c := range conflictErrs {
		if errors.Is(err, c.err) {
			return httpx.WrapError(409, c.code, err)
		}
	}
	for _, e := range validationErrs {
		if errors.Is(err, e) {
			return httpx.ErrValidation
		}
	}
	return httpx.Internal(err)
}

func toPage(page *int, pageSize *int) service.Page {
	p, size := 1, 20
	if page != nil && *page > 0 {
		p = *page
	}
	if pageSize != nil && *pageSize > 0 {
		size = *pageSize
	}
	return service.Page{Limit: int32(size), Offset: int32((p - 1) * size)} //nolint:gosec // bounded by the OpenAPI schema's minimum/maximum
}

func toPageMeta(total int64, page *int, pageSize *int) api.PageMeta {
	p, size := 1, 20
	if page != nil && *page > 0 {
		p = *page
	}
	if pageSize != nil && *pageSize > 0 {
		size = *pageSize
	}
	return api.PageMeta{Total: int(total), Page: p, PageSize: size}
}

func searchValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func toDate(d openapi_types.Date) time.Time { return d.Time }

func toAPIDate(t time.Time) openapi_types.Date { return openapi_types.Date{Time: t} }

func toAPIDatePtr(t *time.Time) *openapi_types.Date {
	if t == nil {
		return nil
	}
	d := openapi_types.Date{Time: *t}
	return &d
}

func toClockTime(s string) (domain.ClockTime, error) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return domain.ClockTime{}, httpx.ErrValidation
	}
	return domain.ClockTime{Hour: t.Hour(), Minute: t.Minute()}, nil
}

func fromClockTime(c domain.ClockTime) string {
	return fmt.Sprintf("%02d:%02d", c.Hour, c.Minute)
}
