// Package http adapts the generated strict-server interface to the
// grading service.
package http

import (
	"bytes"
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// PermissionChecker tells the handler whether the caller may write grades
// for classes they do not personally teach (an admin or a curriculum lead).
type PermissionChecker interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error)
}

type GradingHandler struct {
	service *service.Service
	perms   PermissionChecker
}

func New(svc *service.Service, perms PermissionChecker) *GradingHandler {
	return &GradingHandler{service: svc, perms: perms}
}

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

// canManageAny is true for callers holding manage_master_data, the
// permission schools give curriculum staff who maintain other teachers'
// gradebooks. Everyone else must be the assigned teacher.
func (h *GradingHandler) canManageAny(ctx context.Context) bool {
	if h.perms == nil {
		return false
	}
	set, err := h.perms.EffectivePermissions(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return false
	}
	return set.Has(authz.PermManageMasterData)
}

var errorMap = map[error]*httpx.Error{
	domain.ErrComponentNotFound:    httpx.ErrComponentNotFound,
	domain.ErrComponentCodeExists:  httpx.ErrComponentCodeExists,
	domain.ErrNotTeachingThisClass: httpx.ErrNotTeachingClass,
	domain.ErrGradesNotPublished:   httpx.ErrGradesNotPublished,
	domain.ErrStarBalanceNegative:  httpx.ErrStarBalanceNegative,
	domain.ErrNoActiveTerm:         httpx.ErrNoActiveTerm,
	domain.ErrScoreOutOfRange:      httpx.ErrScoreOutOfRange,
	domain.ErrInvalidInput:         httpx.ErrValidation,
	domain.ErrNoActiveAcademicYear: httpx.ErrValidation,
	domain.ErrNoGradableSubjects:   httpx.ErrNoGradableSubjects,
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

func nullUUID(p *openapi_types.UUID) uuid.NullUUID {
	if p == nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: *p, Valid: true}
}

func uuidPtr(n uuid.NullUUID) *openapi_types.UUID {
	if !n.Valid {
		return nil
	}
	id := openapi_types.UUID(n.UUID)
	return &id
}

func f32(v float64) float32 { return float32(v) }

func f32Ptr(v *float64) *float32 {
	if v == nil {
		return nil
	}
	out := float32(*v)
	return &out
}

func f64Ptr(v *float32) *float64 {
	if v == nil {
		return nil
	}
	out := float64(*v)
	return &out
}

// Scale.

func (h *GradingHandler) GetGradingScale(ctx context.Context, _ api.GetGradingScaleRequestObject) (api.GetGradingScaleResponseObject, error) {
	scale, err := h.service.Scale(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetGradingScale200JSONResponse(toAPIScale(scale)), nil
}

func (h *GradingHandler) UpdateGradingScale(ctx context.Context, request api.UpdateGradingScaleRequestObject) (api.UpdateGradingScaleResponseObject, error) {
	b := request.Body
	scale, err := h.service.UpdateScale(ctx, tenantID(ctx), userID(ctx), domain.Scale{
		Min: float64(b.Min), Max: float64(b.Max), IncreaseMax: float64(b.ReportIncreaseMax), DefaultKKTP: float64(b.DefaultKktp), RoundDecimal: b.RoundDecimal,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateGradingScale200JSONResponse(toAPIScale(scale)), nil
}

// Gradebook.

func (h *GradingHandler) GetGradebook(ctx context.Context, request api.GetGradebookRequestObject) (api.GetGradebookResponseObject, error) {
	book, err := h.service.Gradebook(ctx, tenantID(ctx), service.GradebookQuery{
		ClassID: request.Params.ClassId, SubjectID: request.Params.SubjectId, TermID: nullUUID(request.Params.TermId),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetGradebook200JSONResponse(toAPIGradebook(book)), nil
}

func componentInput(b *api.AssessmentComponentWrite) service.ComponentInput {
	in := service.ComponentInput{
		ClassID: b.ClassId, SubjectID: b.SubjectId, TermID: nullUUID(b.TermId), Code: b.Code,
		Kind: domain.ComponentKind(b.Kind), Weight: float64(b.Weight), Sequence: 1, KKTP: f64Ptr(b.Kktp),
	}
	if b.Description != nil {
		in.Description = *b.Description
	}
	if b.Sequence != nil {
		in.Sequence = *b.Sequence
	}
	return in
}

func (h *GradingHandler) CreateAssessmentComponent(ctx context.Context, request api.CreateAssessmentComponentRequestObject) (api.CreateAssessmentComponentResponseObject, error) {
	component, err := h.service.CreateComponent(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), componentInput(request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateAssessmentComponent201JSONResponse(toAPIComponent(component)), nil
}

func (h *GradingHandler) UpdateAssessmentComponent(ctx context.Context, request api.UpdateAssessmentComponentRequestObject) (api.UpdateAssessmentComponentResponseObject, error) {
	component, err := h.service.UpdateComponent(ctx, tenantID(ctx), request.ComponentId, userID(ctx), h.canManageAny(ctx), componentInput(request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateAssessmentComponent200JSONResponse(toAPIComponent(component)), nil
}

func (h *GradingHandler) DeleteAssessmentComponent(ctx context.Context, request api.DeleteAssessmentComponentRequestObject) (api.DeleteAssessmentComponentResponseObject, error) {
	if err := h.service.DeleteComponent(ctx, tenantID(ctx), request.ComponentId, userID(ctx), h.canManageAny(ctx)); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteAssessmentComponent204Response{}, nil
}

func (h *GradingHandler) SaveComponentScores(ctx context.Context, request api.SaveComponentScoresRequestObject) (api.SaveComponentScoresResponseObject, error) {
	entries := make([]service.ScoreEntry, len(request.Body.Entries))
	for i, e := range request.Body.Entries {
		entries[i] = service.ScoreEntry{StudentUserID: e.StudentUserId, Score: float64(e.Score)}
	}
	book, err := h.service.SaveScores(ctx, tenantID(ctx), request.ComponentId, userID(ctx), h.canManageAny(ctx), entries)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SaveComponentScores200JSONResponse(toAPIGradebook(book)), nil
}

func (h *GradingHandler) SetManualReportScore(ctx context.Context, request api.SetManualReportScoreRequestObject) (api.SetManualReportScoreResponseObject, error) {
	b := request.Body
	score, err := h.service.SetManualScore(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), b.ClassId, b.SubjectId, b.StudentUserId, nullUUID(b.TermId), f64Ptr(b.ManualScore))
	if err != nil {
		return nil, mapError(err)
	}
	return api.SetManualReportScore200JSONResponse(toAPIReportScore(score)), nil
}

func (h *GradingHandler) SetGradePublication(ctx context.Context, request api.SetGradePublicationRequestObject) (api.SetGradePublicationResponseObject, error) {
	b := request.Body
	pub, err := h.service.Publish(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), b.ClassId, b.SubjectId, nullUUID(b.TermId), b.IsPublished)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SetGradePublication200JSONResponse(toAPIPublication(pub)), nil
}

// Grade ranges.

func (h *GradingHandler) ListGradeRanges(ctx context.Context, _ api.ListGradeRangesRequestObject) (api.ListGradeRangesResponseObject, error) {
	ranges, err := h.service.ListGradeRanges(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.GradeRange, len(ranges))
	for i, r := range ranges {
		data[i] = toAPIRange(r)
	}
	return api.ListGradeRanges200JSONResponse{Data: data}, nil
}

func (h *GradingHandler) CreateGradeRange(ctx context.Context, request api.CreateGradeRangeRequestObject) (api.CreateGradeRangeResponseObject, error) {
	b := request.Body
	created, err := h.service.CreateGradeRange(ctx, tenantID(ctx), domain.GradeRange{
		SubjectID: nullUUID(b.SubjectId), TeacherUserID: nullUUID(b.TeacherUserId),
		MinScore: float64(b.MinScore), MaxScore: float64(b.MaxScore), IncreaseAmount: float64(b.IncreaseAmount),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateGradeRange201JSONResponse(toAPIRange(created)), nil
}

func (h *GradingHandler) DeleteGradeRange(ctx context.Context, request api.DeleteGradeRangeRequestObject) (api.DeleteGradeRangeResponseObject, error) {
	if err := h.service.DeleteGradeRange(ctx, tenantID(ctx), request.RangeId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteGradeRange204Response{}, nil
}

// Student view.

func (h *GradingHandler) GetMyGrades(ctx context.Context, request api.GetMyGradesRequestObject) (api.GetMyGradesResponseObject, error) {
	grades, err := h.service.MyGrades(ctx, tenantID(ctx), userID(ctx), nullUUID(request.Params.TermId))
	if err != nil {
		return nil, mapError(err)
	}
	subjects := make([]api.MySubjectGrade, len(grades.Subjects))
	for i, s := range grades.Subjects {
		components := make([]api.MyComponentScore, len(s.Components))
		for j, c := range s.Components {
			components[j] = api.MyComponentScore{Code: c.Code, Kind: api.AssessmentComponentKind(c.Kind), Score: f32(c.Score), Kktp: f32Ptr(c.KKTP)}
		}
		subjects[i] = api.MySubjectGrade{SubjectId: s.SubjectID, Components: components, Average: f32Ptr(s.Average), ReportScore: f32Ptr(s.ReportScore)}
	}
	return api.GetMyGrades200JSONResponse{
		TermId: grades.Term.ID, TermName: grades.Term.Name, Scale: toAPIScale(grades.Scale), Subjects: subjects, Stars: grades.Stars,
	}, nil
}

// Stars.

func (h *GradingHandler) GiveStar(ctx context.Context, request api.GiveStarRequestObject) (api.GiveStarResponseObject, error) {
	b := request.Body
	in := service.StarInput{StudentUserID: b.StudentUserId, ClassID: b.ClassId, SubjectID: nullUUID(b.SubjectId), Delta: b.Delta, VisibleToStudent: true}
	if b.Note != nil {
		in.Note = *b.Note
	}
	if b.VisibleToStudent != nil {
		in.VisibleToStudent = *b.VisibleToStudent
	}
	event, balance, err := h.service.GiveStar(ctx, tenantID(ctx), userID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GiveStar201JSONResponse{Event: toAPIStar(event), Balance: balance}, nil
}

func (h *GradingHandler) GetStarLedger(ctx context.Context, request api.GetStarLedgerRequestObject) (api.GetStarLedgerResponseObject, error) {
	limit := 50
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	events, balance, err := h.service.StarLedger(ctx, tenantID(ctx), request.StudentId, true, limit)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.StarEvent, len(events))
	for i, e := range events {
		data[i] = toAPIStar(e)
	}
	return api.GetStarLedger200JSONResponse{Data: data, Balance: balance}, nil
}

func (h *GradingHandler) ListClassStarBalances(ctx context.Context, request api.ListClassStarBalancesRequestObject) (api.ListClassStarBalancesResponseObject, error) {
	balances, err := h.service.ClassStarBalances(ctx, tenantID(ctx), request.ClassId)
	if err != nil {
		return nil, mapError(err)
	}
	resp := api.ListClassStarBalances200JSONResponse{}
	for _, b := range balances {
		resp.Data = append(resp.Data, struct {
			Balance       int                `json:"balance"`
			StudentUserId openapi_types.UUID `json:"student_user_id"`
		}{Balance: b.Balance, StudentUserId: b.StudentUserID})
	}
	return resp, nil
}

// e-Rapor export.

func (h *GradingHandler) PreviewEraporExport(ctx context.Context, request api.PreviewEraporExportRequestObject) (api.PreviewEraporExportResponseObject, error) {
	preview, err := h.service.PreviewErapor(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), request.Params.ClassId, nullUUID(request.Params.TermId))
	if err != nil {
		return nil, mapError(err)
	}
	return api.PreviewEraporExport200JSONResponse(toAPIEraporPreview(preview)), nil
}

func (h *GradingHandler) ExportErapor(ctx context.Context, request api.ExportEraporRequestObject) (api.ExportEraporResponseObject, error) {
	format := service.EraporFormatXLSX
	if request.Params.Format != nil && *request.Params.Format == api.EraporFormat(service.EraporFormatCSV) {
		format = service.EraporFormatCSV
	}
	file, err := h.service.ExportErapor(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), request.Params.ClassId, nullUUID(request.Params.TermId), format)
	if err != nil {
		return nil, mapError(err)
	}
	if format == service.EraporFormatCSV {
		return api.ExportErapor200TextcsvResponse{
			Body: bytes.NewReader(file.Content), ContentLength: int64(len(file.Content)),
		}, nil
	}
	return api.ExportErapor200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(file.Content), ContentLength: int64(len(file.Content)),
	}, nil
}

func toAPIEraporPreview(p service.EraporPreview) api.EraporPreview {
	rows := make([]api.EraporRow, len(p.Rows))
	for i, row := range p.Rows {
		rows[i] = api.EraporRow{Nisn: row.NISN, SubjectCode: row.SubjectCode, Score: f32(row.Score), Predicate: row.Predicate}
	}
	skipped := make([]api.EraporSkip, len(p.Skipped))
	for i, skip := range p.Skipped {
		skipped[i] = api.EraporSkip{StudentName: skip.StudentName, SubjectName: skip.SubjectName, Reason: api.EraporSkipReason(skip.Reason)}
	}
	return api.EraporPreview{ClassId: p.ClassID, TermId: p.TermID, Rows: rows, Skipped: skipped}
}

// Conversions.

func toAPIScale(s domain.Scale) api.GradingScale {
	return api.GradingScale{Version: s.Version, Min: f32(s.Min), Max: f32(s.Max), ReportIncreaseMax: f32(s.IncreaseMax), DefaultKktp: f32(s.DefaultKKTP), RoundDecimal: s.RoundDecimal}
}

func toAPIComponent(c domain.Component) api.AssessmentComponent {
	out := api.AssessmentComponent{
		Id: c.ID, ClassId: c.ClassID, SubjectId: c.SubjectID, TermId: c.TermID, Code: c.Code,
		Kind: api.AssessmentComponentKind(c.Kind), Weight: f32(c.Weight), Sequence: c.Sequence, Kktp: f32Ptr(c.KKTP),
	}
	if c.TeacherUserID != uuid.Nil {
		teacher := openapi_types.UUID(c.TeacherUserID)
		out.TeacherUserId = &teacher
	}
	if c.Description != "" {
		description := c.Description
		out.Description = &description
	}
	return out
}

func toAPIGradebook(b service.Gradebook) api.Gradebook {
	components := make([]api.AssessmentComponent, len(b.Components))
	for i, c := range b.Components {
		components[i] = toAPIComponent(c)
	}
	students := make([]api.GradebookStudent, len(b.Students))
	for i, s := range b.Students {
		scores := make(map[string]float32, len(s.Scores))
		for id, score := range s.Scores {
			scores[id.String()] = f32(score)
		}
		students[i] = api.GradebookStudent{StudentUserId: s.StudentUserID, Name: s.Name, Scores: scores, Average: f32Ptr(s.Average), ReportScore: f32Ptr(s.ReportScore)}
	}
	return api.Gradebook{
		TermId: b.Term.ID, TermName: b.Term.Name, ClassId: b.ClassID, SubjectId: b.SubjectID,
		Scale: toAPIScale(b.Scale), Components: components, Students: students, IsPublished: b.IsPublished,
	}
}

func toAPIReportScore(s service.ReportScore) api.ReportScore {
	return api.ReportScore{
		TermId: s.TermID, ClassId: s.ClassID, SubjectId: s.SubjectID, StudentUserId: s.StudentUserID,
		PreviousScore: f32Ptr(s.PreviousScore), ManualScore: f32Ptr(s.ManualScore), FinalScore: f32(s.FinalScore), ComputedAt: &s.ComputedAt,
	}
}

func toAPIPublication(p service.Publication) api.GradePublication {
	return api.GradePublication{TermId: p.TermID, ClassId: p.ClassID, SubjectId: p.SubjectID, IsPublished: p.IsPublished, PublishedAt: p.PublishedAt}
}

func toAPIRange(r domain.GradeRange) api.GradeRange {
	return api.GradeRange{
		Id: r.ID, SubjectId: uuidPtr(r.SubjectID), TeacherUserId: uuidPtr(r.TeacherUserID),
		MinScore: f32(r.MinScore), MaxScore: f32(r.MaxScore), IncreaseAmount: f32(r.IncreaseAmount),
	}
}

func toAPIStar(e domain.StarEvent) api.StarEvent {
	return api.StarEvent{
		Id: e.ID, StudentUserId: e.StudentUserID, ClassId: e.ClassID, SubjectId: uuidPtr(e.SubjectID), TeacherUserId: e.TeacherUserID,
		Delta: e.Delta, Note: e.Note, VisibleToStudent: e.VisibleToStudent, CreatedAt: e.CreatedAt,
	}
}
