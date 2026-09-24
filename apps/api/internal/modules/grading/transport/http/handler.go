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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
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

// tenantLocale resolves the current request's tenant to a locale
// reportdoc's FormatDate/PageLabel/EmptyRowsLabelFor understand ("id" or
// "en"), mirroring attendance/academic/scheduling's identically named
// helpers: the gradebook export renders in the tenant's own configured
// locale (tenants.locale), not the requester's Accept-Language header.
func tenantLocale(ctx context.Context) string {
	t, ok := tenant.FromContext(ctx)
	if !ok {
		return i18n.DefaultLocale
	}
	return i18n.FromTenantLocale(t.Locale)
}

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

// canManageSettings is true for callers holding manage_settings -- the
// admin bypass for the grade-range replace endpoint, which a plain
// teacher may only use on their own scope (docs: "teachers manage their
// own ranges, admins keep manage_settings").
func (h *GradingHandler) canManageSettings(ctx context.Context) bool {
	if h.perms == nil {
		return false
	}
	set, err := h.perms.EffectivePermissions(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return false
	}
	return set.Has(authz.PermManageSettings)
}

var errorMap = map[error]*httpx.Error{
	domain.ErrComponentNotFound:    httpx.ErrComponentNotFound,
	domain.ErrComponentCodeExists:  httpx.ErrComponentCodeExists,
	domain.ErrComponentHasGrades:   httpx.ErrComponentHasGrades,
	domain.ErrNotTeachingThisClass: httpx.ErrNotTeachingClass,
	domain.ErrGradesNotPublished:   httpx.ErrGradesNotPublished,
	domain.ErrStarBalanceNegative:  httpx.ErrStarBalanceNegative,
	domain.ErrNoActiveTerm:         httpx.ErrNoActiveTerm,
	domain.ErrScoreOutOfRange:      httpx.ErrScoreOutOfRange,
	domain.ErrInvalidInput:         httpx.ErrValidation,
	domain.ErrNoActiveAcademicYear: httpx.ErrValidation,
	domain.ErrNoGradableSubjects:   httpx.ErrNoGradableSubjects,
	domain.ErrStudentNotInClass:    httpx.ErrStudentNotInClass,
	domain.ErrGradeRangeOverlap:    httpx.ErrGradeRangeOverlap,
	domain.ErrTPExportCodeExists:   httpx.ErrTPExportCodeExists,
	domain.ErrTPKindNotEligible:    httpx.ErrTPKindNotEligible,
	domain.ErrTPMappingNotFound:    httpx.ErrTPMappingNotFound,
	domain.ErrModuleDisabled:       httpx.ErrGradingModuleDisabled,
	domain.ErrInvalidScope:         httpx.ErrGradebookInvalidScope,
	reportdoc.ErrUnknownColumn:     httpx.ErrGradebookUnknownColumn,
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

func stringPtr(v string) *string {
	if v == "" {
		return nil
	}
	return &v
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
	next := domain.Scale{
		Min: float64(b.Min), Max: float64(b.Max), IncreaseMax: float64(b.ReportIncreaseMax), DefaultKKTP: float64(b.DefaultKktp), RoundDecimal: b.RoundDecimal,
	}
	if b.TpKind != nil {
		next.TPKind = domain.ComponentKind(*b.TpKind)
	}
	scale, err := h.service.UpdateScale(ctx, tenantID(ctx), userID(ctx), next)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateGradingScale200JSONResponse(toAPIScale(scale)), nil
}

// Gradebook.

func (h *GradingHandler) GetGradebook(ctx context.Context, request api.GetGradebookRequestObject) (api.GetGradebookResponseObject, error) {
	book, err := h.service.Gradebook(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), service.GradebookQuery{
		ClassID: request.Params.ClassId, SubjectID: request.Params.SubjectId, TermID: nullUUID(request.Params.TermId),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetGradebook200JSONResponse(toAPIGradebook(book)), nil
}

// ExportGradebook renders one class's or a whole grade level's gradebook
// as an XLSX or PDF file, using the exact same data GetGradebook shows.
// NOT the e-Rapor export (ExportErapor/ExportEraporLegacy below), which
// is a completely separate export surface left untouched.
func (h *GradingHandler) ExportGradebook(ctx context.Context, request api.ExportGradebookRequestObject) (api.ExportGradebookResponseObject, error) {
	opts := reportdocOptions(request.Params.Format, request.Params.Title, request.Params.Letterhead, request.Params.Columns)
	file, err := h.service.ExportGradebook(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), service.GradebookExportQuery{
		ClassID: request.Params.ClassId, GradeLevelID: request.Params.GradeLevelId,
		SubjectID: request.Params.SubjectId, TermID: nullUUID(request.Params.TermId),
	}, tenantLocale(ctx), opts)
	if err != nil {
		return nil, mapError(err)
	}
	if opts.Format == reportdoc.FormatPDF {
		return api.ExportGradebook200ApplicationpdfResponse{
			Body: bytes.NewReader(file), ContentLength: int64(len(file)),
		}, nil
	}
	return api.ExportGradebook200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(file), ContentLength: int64(len(file)),
	}, nil
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
		entries[i] = service.ScoreEntry{StudentUserID: e.StudentUserId, Score: f64Ptr(e.Score)}
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
	ranges, err := h.service.ListGradeRanges(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.GradeRange, len(ranges))
	for i, r := range ranges {
		data[i] = toAPIRange(r)
	}
	return api.ListGradeRanges200JSONResponse{Data: data}, nil
}

func (h *GradingHandler) ReplaceGradeRanges(ctx context.Context, request api.ReplaceGradeRangesRequestObject) (api.ReplaceGradeRangesResponseObject, error) {
	b := request.Body
	inputs := make([]service.GradeRangeInput, len(b.Ranges))
	for i, r := range b.Ranges {
		inputs[i] = service.GradeRangeInput{MinScore: float64(r.MinScore), MaxScore: float64(r.MaxScore), IncreaseAmount: float64(r.IncreaseAmount)}
	}
	teacherUserID := nullUUID(b.TeacherUserId)
	// canManageSettings bypasses the "own ranges only" scope check the
	// same way canManageAny bypasses requireTeaches elsewhere; a plain
	// teacher with no teacher_user_id in the request defaults to
	// themselves rather than being refused for omitting it.
	if !h.canManageSettings(ctx) && !teacherUserID.Valid {
		teacherUserID = uuid.NullUUID{UUID: userID(ctx), Valid: true}
	}
	ranges, err := h.service.ReplaceGradeRanges(ctx, tenantID(ctx), userID(ctx), h.canManageSettings(ctx), b.SubjectId, teacherUserID, inputs)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.GradeRange, len(ranges))
	for i, r := range ranges {
		data[i] = toAPIRange(r)
	}
	return api.ReplaceGradeRanges200JSONResponse{Data: data}, nil
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

func (h *GradingHandler) GetMyStars(ctx context.Context, _ api.GetMyStarsRequestObject) (api.GetMyStarsResponseObject, error) {
	groups, total, err := h.service.MyStars(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	subjects := make([]api.MyStarGroup, len(groups))
	for i, g := range groups {
		subjects[i] = api.MyStarGroup{
			SubjectId: uuidPtr(g.SubjectID), SubjectName: stringPtr(g.SubjectName),
			TeacherUserId: g.TeacherUserID, TeacherName: g.TeacherName, Total: g.Total, LastAwardedAt: g.LastAwardedAt,
		}
	}
	return api.GetMyStars200JSONResponse{Total: total, Subjects: subjects}, nil
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
	event, balance, err := h.service.GiveStar(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), in)
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
	events, balance, err := h.service.StarLedger(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), request.StudentId, true, limit)
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
	balances, err := h.service.ClassStarBalances(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), request.ClassId)
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

// TP mapping.

func (h *GradingHandler) ListTPMappings(ctx context.Context, request api.ListTPMappingsRequestObject) (api.ListTPMappingsResponseObject, error) {
	mappings, err := h.service.ListTPMappings(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), request.Params.ClassId, request.Params.SubjectId, nullUUID(request.Params.TermId))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.TPMapping, len(mappings))
	for i, m := range mappings {
		data[i] = toAPITPMapping(m)
	}
	return api.ListTPMappings200JSONResponse{Data: data}, nil
}

func (h *GradingHandler) SaveTPMapping(ctx context.Context, request api.SaveTPMappingRequestObject) (api.SaveTPMappingResponseObject, error) {
	b := request.Body
	mapping, err := h.service.SaveTPMapping(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), service.TPMappingInput{
		ComponentID: b.ComponentId, ExportCode: b.ExportCode, RMin: float64(b.RMin), RMax: float64(b.RMax), TMin: float64(b.TMin), TMax: float64(b.TMax),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.SaveTPMapping200JSONResponse(toAPITPMapping(mapping)), nil
}

func (h *GradingHandler) DeleteTPMapping(ctx context.Context, request api.DeleteTPMappingRequestObject) (api.DeleteTPMappingResponseObject, error) {
	if err := h.service.DeleteTPMapping(ctx, tenantID(ctx), userID(ctx), request.MappingId, h.canManageAny(ctx)); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteTPMapping204Response{}, nil
}

func toAPITPMapping(m domain.TPMapping) api.TPMapping {
	return api.TPMapping{
		Id: m.ID, ComponentId: m.ComponentID, ExportCode: m.ExportCode,
		RMin: f32(m.RMin), RMax: f32(m.RMax), TMin: f32(m.TMin), TMax: f32(m.TMax),
	}
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

func (h *GradingHandler) ExportEraporLegacy(ctx context.Context, request api.ExportEraporLegacyRequestObject) (api.ExportEraporLegacyResponseObject, error) {
	file, err := h.service.ExportEraporLegacy(ctx, tenantID(ctx), userID(ctx), h.canManageAny(ctx), request.Params.ClassId, request.Params.SubjectId, nullUUID(request.Params.TermId))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ExportEraporLegacy200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
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
	out := api.GradingScale{Version: s.Version, Min: f32(s.Min), Max: f32(s.Max), ReportIncreaseMax: f32(s.IncreaseMax), DefaultKktp: f32(s.DefaultKKTP), RoundDecimal: s.RoundDecimal}
	if s.TPKind != "" {
		kind := api.AssessmentComponentKind(s.TPKind)
		out.TpKind = &kind
	}
	return out
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
		students[i] = api.GradebookStudent{
			StudentUserId: s.StudentUserID, Name: s.Name, Scores: scores, Average: f32Ptr(s.Average),
			FinalKktp: f32Ptr(s.FinalKKTP), ReportScore: f32Ptr(s.ReportScore),
		}
	}
	return api.Gradebook{
		TermId: b.Term.ID, TermName: b.Term.Name, ClassId: b.ClassID, SubjectId: b.SubjectID,
		Scale: toAPIScale(b.Scale), Components: components, Students: students, IsPublished: b.IsPublished,
	}
}

func toAPIReportScore(s service.ReportScore) api.ReportScore {
	return api.ReportScore{
		TermId: s.TermID, ClassId: s.ClassID, SubjectId: s.SubjectID, StudentUserId: s.StudentUserID,
		PreviousScore: f32Ptr(s.PreviousScore), ManualScore: f32Ptr(s.ManualScore), AutomaticScore: f32Ptr(s.AutomaticScore),
		FinalScore: f32(s.FinalScore), ComputedAt: &s.ComputedAt,
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
