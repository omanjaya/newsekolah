// Package http adapts the generated strict-server interface to the
// supervision service.
package http

import (
	"bytes"
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type SupervisionHandler struct{ service *service.Service }

func New(svc *service.Service) *SupervisionHandler { return &SupervisionHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

// tenantLocale resolves the current request's tenant to a locale
// reportdoc's FormatDate/PageLabel/EmptyRowsLabelFor understand,
// defaulting to Indonesian. Mirrors reports/transport/http.tenantLocale.
func tenantLocale(ctx context.Context) string {
	t, ok := tenant.FromContext(ctx)
	if !ok {
		return i18n.DefaultLocale
	}
	return i18n.FromTenantLocale(t.Locale)
}

var errorMap = map[error]*httpx.Error{
	domain.ErrCycleNotFound:        httpx.ErrSupervisionCycleNotFound,
	domain.ErrInstrumentInvalid:    httpx.ErrSupervisionInstrumentInvalid,
	domain.ErrScheduledNotFound:    httpx.ErrSupervisionScheduledNotFound,
	domain.ErrScheduledAlreadyDone: httpx.ErrSupervisionScheduledAlreadyDone,
	domain.ErrObservationNotFound:  httpx.ErrSupervisionObservationNotFound,
	domain.ErrObservationForbidden: httpx.ErrSupervisionObservationForbidden,
	domain.ErrScoreCountMismatch:   httpx.ErrSupervisionScoreMismatch,
	domain.ErrScoreOutOfRange:      httpx.ErrSupervisionScoreOutOfRange,
	domain.ErrLessonNotResolved:    httpx.ErrSupervisionLessonNotResolved,
	domain.ErrModuleDisabled:       httpx.ErrSupervisionModuleDisabled,
	domain.ErrInvalidInput:         httpx.ErrValidation,
	domain.ErrNoActiveAcademicYear: httpx.ErrValidation,
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

func toAPIInstrument(i domain.Instrument) api.SupervisionInstrument {
	criteria := make([]api.SupervisionCriterion, len(i.Criteria))
	for idx, c := range i.Criteria {
		criteria[idx] = api.SupervisionCriterion{Key: c.Key, Name: c.Name}
	}
	return api.SupervisionInstrument{Name: i.Name, ScaleMin: i.ScaleMin, ScaleMax: i.ScaleMax, Criteria: criteria}
}

func fromAPIInstrument(i api.SupervisionInstrument) domain.Instrument {
	criteria := make([]domain.Criterion, len(i.Criteria))
	for idx, c := range i.Criteria {
		criteria[idx] = domain.Criterion{Key: c.Key, Name: c.Name}
	}
	return domain.Instrument{Name: i.Name, ScaleMin: i.ScaleMin, ScaleMax: i.ScaleMax, Criteria: criteria}
}

func toAPICycle(c domain.SupervisionCycle) api.SupervisionCycle {
	return api.SupervisionCycle{
		Id: openapi_types.UUID(c.ID), AcademicYearId: openapi_types.UUID(c.AcademicYearID),
		Name: c.Name, Instrument: toAPIInstrument(c.Instrument),
	}
}

func toAPIScheduled(o domain.ScheduledObservation) api.ScheduledObservation {
	return api.ScheduledObservation{
		Id: openapi_types.UUID(o.ID), CycleId: openapi_types.UUID(o.CycleID), ScheduleId: openapi_types.UUID(o.ScheduleID),
		LessonDate: openapi_types.Date{Time: o.LessonDate}, TeacherUserId: openapi_types.UUID(o.TeacherUserID),
		ObserverUserId: openapi_types.UUID(o.ObserverUserID),
	}
}

func toAPIScores(scores []domain.CriterionScore) []api.CriterionScore {
	out := make([]api.CriterionScore, len(scores))
	for i, s := range scores {
		out[i] = api.CriterionScore{CriterionKey: s.CriterionKey, Score: s.Score}
	}
	return out
}

func fromAPIScores(scores []api.CriterionScore) []domain.CriterionScore {
	out := make([]domain.CriterionScore, len(scores))
	for i, s := range scores {
		out[i] = domain.CriterionScore{CriterionKey: s.CriterionKey, Score: s.Score}
	}
	return out
}

func toAPIObservation(o domain.Observation) api.Observation {
	return api.Observation{
		Id: openapi_types.UUID(o.ID), ScheduledId: openapi_types.UUID(o.ScheduledID), CycleId: openapi_types.UUID(o.CycleID),
		TeacherUserId: openapi_types.UUID(o.TeacherUserID), ObserverUserId: openapi_types.UUID(o.ObserverUserID),
		Scores: toAPIScores(o.Scores), ObserverNotes: o.ObserverNotes, TeacherResponse: o.TeacherResponse,
		AgreedFollowUp: o.AgreedFollowUp, ObservedAt: o.ObservedAt,
	}
}

// Cycles.

func (h *SupervisionHandler) ListSupervisionCycles(ctx context.Context, _ api.ListSupervisionCyclesRequestObject) (api.ListSupervisionCyclesResponseObject, error) {
	cycles, err := h.service.ListCyclesForYear(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.SupervisionCycle, len(cycles))
	for i, c := range cycles {
		data[i] = toAPICycle(c)
	}
	return api.ListSupervisionCycles200JSONResponse{Data: data}, nil
}

func (h *SupervisionHandler) CreateSupervisionCycle(ctx context.Context, request api.CreateSupervisionCycleRequestObject) (api.CreateSupervisionCycleResponseObject, error) {
	b := request.Body
	cycle, err := h.service.CreateCycle(ctx, tenantID(ctx), service.CycleInput{Name: b.Name, Instrument: fromAPIInstrument(b.Instrument)})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateSupervisionCycle201JSONResponse(toAPICycle(cycle)), nil
}

func (h *SupervisionHandler) GetSupervisionCycle(ctx context.Context, request api.GetSupervisionCycleRequestObject) (api.GetSupervisionCycleResponseObject, error) {
	cycle, err := h.service.GetCycle(ctx, tenantID(ctx), request.CycleId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetSupervisionCycle200JSONResponse(toAPICycle(cycle)), nil
}

func (h *SupervisionHandler) UpdateSupervisionCycle(ctx context.Context, request api.UpdateSupervisionCycleRequestObject) (api.UpdateSupervisionCycleResponseObject, error) {
	b := request.Body
	cycle, err := h.service.UpdateCycle(ctx, tenantID(ctx), request.CycleId, service.CycleInput{Name: b.Name, Instrument: fromAPIInstrument(b.Instrument)})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateSupervisionCycle200JSONResponse(toAPICycle(cycle)), nil
}

// Scheduled observations.

func (h *SupervisionHandler) ListScheduledObservations(ctx context.Context, request api.ListScheduledObservationsRequestObject) (api.ListScheduledObservationsResponseObject, error) {
	scheduled, err := h.service.ListScheduledForCycle(ctx, tenantID(ctx), request.CycleId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ScheduledObservation, len(scheduled))
	for i, s := range scheduled {
		data[i] = toAPIScheduled(s)
	}
	return api.ListScheduledObservations200JSONResponse{Data: data}, nil
}

func (h *SupervisionHandler) ListScheduledObservationsForTeacher(ctx context.Context, request api.ListScheduledObservationsForTeacherRequestObject) (api.ListScheduledObservationsForTeacherResponseObject, error) {
	scheduled, err := h.service.ListScheduledForTeacher(ctx, tenantID(ctx), request.CycleId, request.TeacherId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ScheduledObservation, len(scheduled))
	for i, s := range scheduled {
		data[i] = toAPIScheduled(s)
	}
	return api.ListScheduledObservationsForTeacher200JSONResponse{Data: data}, nil
}

func (h *SupervisionHandler) ScheduleObservation(ctx context.Context, request api.ScheduleObservationRequestObject) (api.ScheduleObservationResponseObject, error) {
	b := request.Body
	scheduled, err := h.service.ScheduleObservation(ctx, tenantID(ctx), service.ScheduleObservationInput{
		CycleID: request.CycleId, ScheduleID: b.ScheduleId, LessonDate: b.LessonDate.Time, ObserverUserID: userID(ctx),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScheduleObservation201JSONResponse(toAPIScheduled(scheduled)), nil
}

// Observations.

func (h *SupervisionHandler) CompleteObservation(ctx context.Context, request api.CompleteObservationRequestObject) (api.CompleteObservationResponseObject, error) {
	b := request.Body
	obs, err := h.service.CompleteObservation(ctx, tenantID(ctx), userID(ctx), service.CompleteObservationInput{
		ScheduledID: b.ScheduledId, Scores: fromAPIScores(b.Scores), ObserverNotes: b.ObserverNotes,
		TeacherResponse: strOr(b.TeacherResponse), AgreedFollowUp: strOr(b.AgreedFollowUp), ObservedAt: b.ObservedAt,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CompleteObservation201JSONResponse(toAPIObservation(obs)), nil
}

func (h *SupervisionHandler) GetObservation(ctx context.Context, request api.GetObservationRequestObject) (api.GetObservationResponseObject, error) {
	obs, err := h.service.GetObservation(ctx, tenantID(ctx), request.ObservationId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetObservation200JSONResponse(toAPIObservation(obs)), nil
}

func (h *SupervisionHandler) RespondToObservation(ctx context.Context, request api.RespondToObservationRequestObject) (api.RespondToObservationResponseObject, error) {
	b := request.Body
	obs, err := h.service.RecordTeacherResponse(ctx, tenantID(ctx), request.ObservationId, userID(ctx), strOr(b.TeacherResponse), strOr(b.AgreedFollowUp))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RespondToObservation200JSONResponse(toAPIObservation(obs)), nil
}

// Reports.

func (h *SupervisionHandler) GetTeacherSupervisionReport(ctx context.Context, request api.GetTeacherSupervisionReportRequestObject) (api.GetTeacherSupervisionReportResponseObject, error) {
	report, err := h.service.TeacherReport(ctx, tenantID(ctx), request.CycleId, request.TeacherId)
	if err != nil {
		return nil, mapError(err)
	}
	criterionAvg := make(map[string]float32, len(report.CriterionAvg))
	for k, v := range report.CriterionAvg {
		criterionAvg[k] = float32(v)
	}
	observations := make([]api.Observation, len(report.Observations))
	for i, o := range report.Observations {
		observations[i] = toAPIObservation(o)
	}
	return api.GetTeacherSupervisionReport200JSONResponse{
		TeacherUserId: openapi_types.UUID(report.TeacherUserID), TeacherName: report.TeacherName,
		Cycle: toAPICycle(report.Cycle), Observations: observations,
		OverallAverage: float32(report.OverallAverage), CriterionAverage: criterionAvg,
	}, nil
}

func (h *SupervisionHandler) ExportTeacherSupervisionReport(ctx context.Context, request api.ExportTeacherSupervisionReportRequestObject) (api.ExportTeacherSupervisionReportResponseObject, error) {
	p := request.Params
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}
	if p.Format != nil {
		opts.Format = reportdoc.Format(*p.Format)
	}
	if p.Title != nil {
		opts.Title = *p.Title
	}
	if p.Letterhead != nil {
		opts.ShowLetterhead = *p.Letterhead
	}
	if p.Columns != nil {
		for _, c := range httpx.ParseReportColumns(*p.Columns) {
			opts.Columns = append(opts.Columns, reportdoc.ColumnChoice{Key: c.Key, Label: c.Label})
		}
	}

	body, err := h.service.ExportTeacherReport(ctx, tenantID(ctx), request.CycleId, request.TeacherId, tenantLocale(ctx), opts)
	if err != nil {
		if errors.Is(err, reportdoc.ErrUnknownColumn) {
			return nil, httpx.ErrValidation
		}
		return nil, mapError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return api.ExportTeacherSupervisionReport200ApplicationpdfResponse{
			Body: bytes.NewReader(body), ContentLength: int64(len(body)),
		}, nil
	}
	return api.ExportTeacherSupervisionReport200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(body), ContentLength: int64(len(body)),
	}, nil
}

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
