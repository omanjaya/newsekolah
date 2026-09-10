// Package http adapts the generated strict-server interface to the
// analytics service: mapping DTOs to and from domain and service types
// only, no business logic, per docs/03-layered-architecture.md section 1.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type AnalyticsHandler struct{ service *service.Service }

func New(svc *service.Service) *AnalyticsHandler { return &AnalyticsHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	service.ErrNoActiveAcademicYear: httpx.ErrAnalyticsNoActiveAcademicYear,
	service.ErrNotHomeroomTeacher:   httpx.ErrAnalyticsNotHomeroomTeacher,
	service.ErrResultNotFound:       httpx.ErrAnalyticsResultNotFound,
	domain.ErrInvalidPolicy:         httpx.ErrAnalyticsInvalidPolicy,
}

func mapError(err error) error {
	for d, h := range errorMap {
		if errors.Is(err, d) {
			return h
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func (h *AnalyticsHandler) ListAtRiskStudents(ctx context.Context, _ api.ListAtRiskStudentsRequestObject) (api.ListAtRiskStudentsResponseObject, error) {
	results, err := h.service.ListAtRiskStudents(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.StudentRisk, len(results))
	for i, r := range results {
		data[i] = toAPIStudentRisk(r)
	}
	return api.ListAtRiskStudents200JSONResponse{Data: data}, nil
}

func (h *AnalyticsHandler) GetStudentRisk(ctx context.Context, request api.GetStudentRiskRequestObject) (api.GetStudentRiskResponseObject, error) {
	result, err := h.service.GetStudentRisk(ctx, tenantID(ctx), userID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStudentRisk200JSONResponse(toAPIStudentRiskDetail(result)), nil
}

func (h *AnalyticsHandler) GetEarlyWarningPolicy(ctx context.Context, _ api.GetEarlyWarningPolicyRequestObject) (api.GetEarlyWarningPolicyResponseObject, error) {
	policy, err := h.service.Policy(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetEarlyWarningPolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func (h *AnalyticsHandler) UpdateEarlyWarningPolicy(ctx context.Context, request api.UpdateEarlyWarningPolicyRequestObject) (api.UpdateEarlyWarningPolicyResponseObject, error) {
	if request.Body == nil {
		return nil, httpx.ErrValidation
	}
	policy, err := h.service.UpdatePolicy(ctx, tenantID(ctx), userID(ctx), fromAPIPolicy(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateEarlyWarningPolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func toAPIStudentRisk(r service.StoredResult) api.StudentRisk {
	item := api.StudentRisk{
		StudentUserId: r.StudentUserID, Level: api.RiskLevel(r.Level), Score: r.Score, ComputedAt: r.ComputedAt,
	}
	if r.ClassID.Valid {
		item.ClassId = r.ClassID.UUID
	}
	return item
}

func toAPIStudentRiskDetail(r service.StoredResult) api.StudentRiskDetail {
	detail := api.StudentRiskDetail{
		StudentUserId: r.StudentUserID, Level: api.RiskLevel(r.Level), Score: r.Score, ComputedAt: r.ComputedAt,
		Signals: api.RiskSignals{
			HasAttendance: r.Signals.HasAttendance, ConsideredDays: r.Signals.ConsideredDays, AbsentDays: r.Signals.AbsentDays,
			ActiveViolationCount: r.Signals.ActiveViolationCount, DisciplinePoints: r.Signals.DisciplinePoints,
			WarningLetterCount: r.Signals.WarningLetterCount, HasGradeTrend: r.Signals.HasGradeTrend,
			PreviousAverage: float32(r.Signals.PreviousAverage), CurrentAverage: float32(r.Signals.CurrentAverage),
		},
		Reasons: make([]api.RiskReason, len(r.Reasons)),
	}
	if r.ClassID.Valid {
		detail.ClassId = r.ClassID.UUID
	}
	for i, reason := range r.Reasons {
		detail.Reasons[i] = api.RiskReason{Code: string(reason.Code), Weight: reason.Weight, Params: reason.Params}
	}
	return detail
}

func toAPIPolicy(p domain.Policy) api.EarlyWarningPolicy {
	return api.EarlyWarningPolicy{
		Version: p.Version, WindowDays: p.WindowDays,
		AttendanceWatchRate: float32(p.AttendanceWatchRate), AttendanceAtRiskRate: float32(p.AttendanceAtRiskRate),
		DisciplineWatchPoints: p.DisciplineWatchPoints, DisciplineAtRiskPoints: p.DisciplineAtRiskPoints,
		WarningLetterWatchCount: p.WarningLetterWatchCount, WarningLetterAtRiskCount: p.WarningLetterAtRiskCount,
		GradeDropWatchPoints: float32(p.GradeDropWatchPoints), GradeDropAtRiskPoints: float32(p.GradeDropAtRiskPoints),
		AttendanceWeight: p.AttendanceWeight, DisciplineWeight: p.DisciplineWeight, WarningWeight: p.WarningWeight, GradeWeight: p.GradeWeight,
		WatchScore: p.WatchScore, AtRiskScore: p.AtRiskScore,
	}
}

func fromAPIPolicy(p api.EarlyWarningPolicyWrite) domain.Policy {
	return domain.Policy{
		WindowDays:          p.WindowDays,
		AttendanceWatchRate: float64(p.AttendanceWatchRate), AttendanceAtRiskRate: float64(p.AttendanceAtRiskRate),
		DisciplineWatchPoints: p.DisciplineWatchPoints, DisciplineAtRiskPoints: p.DisciplineAtRiskPoints,
		WarningLetterWatchCount: p.WarningLetterWatchCount, WarningLetterAtRiskCount: p.WarningLetterAtRiskCount,
		GradeDropWatchPoints: float64(p.GradeDropWatchPoints), GradeDropAtRiskPoints: float64(p.GradeDropAtRiskPoints),
		AttendanceWeight: p.AttendanceWeight, DisciplineWeight: p.DisciplineWeight, WarningWeight: p.WarningWeight, GradeWeight: p.GradeWeight,
		WatchScore: p.WatchScore, AtRiskScore: p.AtRiskScore,
	}
}
