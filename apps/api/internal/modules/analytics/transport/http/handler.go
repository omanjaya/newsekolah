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
	service.ErrRecomputeInProgress:  httpx.ErrAnalyticsRecomputeInProgress,
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

// ListAtRiskStudents grants the isAdminCaller (admin/super_admin/
// principal) roles school-wide scope through service.ListAtRiskStudents'
// isOverseer parameter, on top of the counselor/leadership duty bypass
// the service already applies: those system roles hold view_early_warning
// without necessarily holding a counseling/leadership duty or being a
// homeroom teacher, and would otherwise be turned away with
// ErrNotHomeroomTeacher despite the permission check having let them in.
func (h *AnalyticsHandler) ListAtRiskStudents(ctx context.Context, _ api.ListAtRiskStudentsRequestObject) (api.ListAtRiskStudentsResponseObject, error) {
	results, err := h.service.ListAtRiskStudents(ctx, tenantID(ctx), userID(ctx), isAdminCaller(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.StudentRisk, len(results))
	for i, r := range results {
		data[i] = toAPIStudentRisk(r)
	}
	return api.ListAtRiskStudents200JSONResponse{Data: data}, nil
}

// GetStudentRisk applies the same isAdminCaller bypass as
// ListAtRiskStudents (see its comment).
func (h *AnalyticsHandler) GetStudentRisk(ctx context.Context, request api.GetStudentRiskRequestObject) (api.GetStudentRiskResponseObject, error) {
	result, err := h.service.GetStudentRisk(ctx, tenantID(ctx), userID(ctx), request.StudentId, isAdminCaller(ctx))
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
	policy, recomputed, err := h.service.UpdatePolicy(ctx, tenantID(ctx), userID(ctx), fromAPIPolicy(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateEarlyWarningPolicy200JSONResponse(toAPIPolicySaved(policy, recomputed)), nil
}

// RecomputeEarlyWarning rescores the caller's school now, or answers 409
// while another rescore of it is running.
func (h *AnalyticsHandler) RecomputeEarlyWarning(ctx context.Context, _ api.RecomputeEarlyWarningRequestObject) (api.RecomputeEarlyWarningResponseObject, error) {
	scored, computedAt, err := h.service.RecomputeNow(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RecomputeEarlyWarning200JSONResponse{Scored: scored, ComputedAt: computedAt}, nil
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
			ScoredSubjects: r.Signals.ScoredSubjects, SubjectsBelowKktp: r.Signals.SubjectsBelowKKTP,
			ScoreDecimals: r.ScoreDecimals,
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
		BelowKktpWatchCount: p.BelowKKTPWatchCount, BelowKktpAtRiskCount: p.BelowKKTPAtRiskCount,
		AttendanceWeight: p.AttendanceWeight, DisciplineWeight: p.DisciplineWeight, WarningWeight: p.WarningWeight, GradeWeight: p.GradeWeight,
		WatchScore: p.WatchScore, AtRiskScore: p.AtRiskScore,
	}
}

// toAPIPolicySaved is toAPIPolicy plus whether the save rescored the school.
func toAPIPolicySaved(p domain.Policy, recomputed bool) api.EarlyWarningPolicySaved {
	a := toAPIPolicy(p)
	return api.EarlyWarningPolicySaved{
		Version: a.Version, WindowDays: a.WindowDays,
		AttendanceWatchRate: a.AttendanceWatchRate, AttendanceAtRiskRate: a.AttendanceAtRiskRate,
		DisciplineWatchPoints: a.DisciplineWatchPoints, DisciplineAtRiskPoints: a.DisciplineAtRiskPoints,
		WarningLetterWatchCount: a.WarningLetterWatchCount, WarningLetterAtRiskCount: a.WarningLetterAtRiskCount,
		GradeDropWatchPoints: a.GradeDropWatchPoints, GradeDropAtRiskPoints: a.GradeDropAtRiskPoints,
		BelowKktpWatchCount: a.BelowKktpWatchCount, BelowKktpAtRiskCount: a.BelowKktpAtRiskCount,
		AttendanceWeight: a.AttendanceWeight, DisciplineWeight: a.DisciplineWeight, WarningWeight: a.WarningWeight, GradeWeight: a.GradeWeight,
		WatchScore: a.WatchScore, AtRiskScore: a.AtRiskScore,
		Recomputed: recomputed,
	}
}

func fromAPIPolicy(p api.EarlyWarningPolicyWrite) domain.Policy {
	return domain.Policy{
		WindowDays:          p.WindowDays,
		AttendanceWatchRate: float64(p.AttendanceWatchRate), AttendanceAtRiskRate: float64(p.AttendanceAtRiskRate),
		DisciplineWatchPoints: p.DisciplineWatchPoints, DisciplineAtRiskPoints: p.DisciplineAtRiskPoints,
		WarningLetterWatchCount: p.WarningLetterWatchCount, WarningLetterAtRiskCount: p.WarningLetterAtRiskCount,
		GradeDropWatchPoints: float64(p.GradeDropWatchPoints), GradeDropAtRiskPoints: float64(p.GradeDropAtRiskPoints),
		BelowKKTPWatchCount: p.BelowKktpWatchCount, BelowKKTPAtRiskCount: p.BelowKktpAtRiskCount,
		AttendanceWeight: p.AttendanceWeight, DisciplineWeight: p.DisciplineWeight, WarningWeight: p.WarningWeight, GradeWeight: p.GradeWeight,
		WatchScore: p.WatchScore, AtRiskScore: p.AtRiskScore,
	}
}
