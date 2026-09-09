// Package http adapts the generated strict-server interface to the parent
// view. The permission check is the operation's own x-permission; the
// service adds the per-child link check on top.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/family/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type FamilyHandler struct{ service *service.Service }

func New(svc *service.Service) *FamilyHandler { return &FamilyHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

func mapError(err error) error {
	if errors.Is(err, service.ErrNotLinked) {
		return httpx.ErrForbidden
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func parseDate(value string) openapi_types.Date {
	parsed, err := openapi_types.Date{}, error(nil)
	if err = parsed.UnmarshalJSON([]byte(`"` + value + `"`)); err != nil {
		return openapi_types.Date{}
	}
	return parsed
}

func (h *FamilyHandler) GetChildAttendance(ctx context.Context, request api.GetChildAttendanceRequestObject) (api.GetChildAttendanceResponseObject, error) {
	days, totals, err := h.service.ChildAttendance(ctx, tenantID(ctx), userID(ctx), request.StudentId, request.Params.Month)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ChildCalendarDay, len(days))
	for i, d := range days {
		data[i] = api.ChildCalendarDay{
			Date: parseDate(d.Date), StatusCode: d.StatusCode, ExpectedSessions: d.ExpectedSessions,
			SubmittedSessions: d.SubmittedSessions, Complete: d.Complete,
		}
	}
	return api.GetChildAttendance200JSONResponse{Data: data, Totals: totals}, nil
}

func (h *FamilyHandler) GetChildGrades(ctx context.Context, request api.GetChildGradesRequestObject) (api.GetChildGradesResponseObject, error) {
	grades, err := h.service.ChildGrades(ctx, tenantID(ctx), userID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	subjects := make([]api.ChildSubjectGrade, len(grades.Subjects))
	for i, s := range grades.Subjects {
		subjects[i] = api.ChildSubjectGrade{SubjectId: s.SubjectID, Average: floatPtr(s.Average), ReportScore: floatPtr(s.ReportScore)}
	}
	return api.GetChildGrades200JSONResponse{TermId: grades.TermID, TermName: grades.TermName, Subjects: subjects, Stars: grades.Stars}, nil
}

func (h *FamilyHandler) GetChildDiscipline(ctx context.Context, request api.GetChildDisciplineRequestObject) (api.GetChildDisciplineResponseObject, error) {
	summary, err := h.service.ChildDiscipline(ctx, tenantID(ctx), userID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	records := make([]api.ChildViolation, len(summary.Records))
	for i, r := range summary.Records {
		records[i] = api.ChildViolation{TypeName: r.TypeName, Points: r.Points, OccurredOn: parseDate(r.OccurredOn)}
	}
	letters := make([]api.ChildWarningLetter, len(summary.Letters))
	for i, l := range summary.Letters {
		letters[i] = api.ChildWarningLetter{Number: l.Number, LevelLabel: l.LevelLabel, IssuedAt: parseDate(l.IssuedAt)}
	}
	return api.GetChildDiscipline200JSONResponse{TotalPoints: summary.TotalPoints, Records: records, Letters: letters}, nil
}

func floatPtr(v *float64) *float32 {
	if v == nil {
		return nil
	}
	out := float32(*v)
	return &out
}
