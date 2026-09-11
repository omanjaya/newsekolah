// Package http adapts the generated strict-server interface to the
// discipline service.
package http

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type DisciplineHandler struct{ service *service.Service }

func New(svc *service.Service) *DisciplineHandler { return &DisciplineHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	domain.ErrViolationTypeNotFound:   httpx.ErrViolationTypeNotFound,
	domain.ErrViolationTypeCodeExists: httpx.ErrViolationTypeCodeExists,
	domain.ErrViolationTypeInactive:   httpx.ErrViolationTypeInactive,
	domain.ErrRecordNotFound:          httpx.ErrViolationRecordNotFound,
	domain.ErrRecordAlreadyVoided:     httpx.ErrViolationRecordVoided,
	domain.ErrLetterNotFound:          httpx.ErrWarningLetterNotFound,
	domain.ErrLetterLevelNotDue:       httpx.ErrWarningLetterNotDue,
	domain.ErrLetterAlreadyIssued:     httpx.ErrWarningLetterIssued,
	domain.ErrCounselingNotFound:      httpx.ErrCounselingNotFound,
	domain.ErrCounselingForbidden:     httpx.ErrCounselingForbidden,
	domain.ErrInvalidInput:            httpx.ErrValidation,
	domain.ErrNoActiveAcademicYear:    httpx.ErrValidation,
	domain.ErrStudentNotEnrolled:      httpx.ErrStudentNotEnrolled,
	domain.ErrStudentInactive:         httpx.ErrStudentInactive,
	domain.ErrAttachmentNotFound:      httpx.ErrAttachmentNotFound,
	domain.ErrAttachmentTooLarge:      httpx.ErrAttachmentTooLarge,
	domain.ErrAttachmentInvalidType:   httpx.ErrAttachmentInvalidType,
	domain.ErrReportUnavailable:       httpx.ErrReportUnavailable,
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

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func intOr(p *int, def int) int {
	if p == nil {
		return def
	}
	return *p
}

// Catalog.

func (h *DisciplineHandler) ListViolationTypes(ctx context.Context, request api.ListViolationTypesRequestObject) (api.ListViolationTypesResponseObject, error) {
	includeInactive := request.Params.IncludeInactive != nil && *request.Params.IncludeInactive
	types, err := h.service.ListViolationTypes(ctx, tenantID(ctx), includeInactive, strOr(request.Params.Search))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ViolationType, len(types))
	for i, t := range types {
		data[i] = toAPIType(t)
	}
	return api.ListViolationTypes200JSONResponse{Data: data}, nil
}

func (h *DisciplineHandler) CreateViolationType(ctx context.Context, request api.CreateViolationTypeRequestObject) (api.CreateViolationTypeResponseObject, error) {
	b := request.Body
	t, err := h.service.CreateViolationType(ctx, domain.ViolationType{TenantID: tenantID(ctx), Code: b.Code, Name: b.Name, Points: b.Points, Category: strOr(b.Category)})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateViolationType201JSONResponse(toAPIType(t)), nil
}

func (h *DisciplineHandler) UpdateViolationType(ctx context.Context, request api.UpdateViolationTypeRequestObject) (api.UpdateViolationTypeResponseObject, error) {
	b := request.Body
	isActive := b.IsActive == nil || *b.IsActive
	t, err := h.service.UpdateViolationType(ctx, domain.ViolationType{TenantID: tenantID(ctx), ID: request.TypeId, Code: b.Code, Name: b.Name, Points: b.Points, Category: strOr(b.Category), IsActive: isActive})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateViolationType200JSONResponse(toAPIType(t)), nil
}

func (h *DisciplineHandler) DeleteViolationType(ctx context.Context, request api.DeleteViolationTypeRequestObject) (api.DeleteViolationTypeResponseObject, error) {
	if err := h.service.DeleteViolationType(ctx, tenantID(ctx), request.TypeId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteViolationType204Response{}, nil
}

// Policy.

func (h *DisciplineHandler) GetDisciplinePolicy(ctx context.Context, _ api.GetDisciplinePolicyRequestObject) (api.GetDisciplinePolicyResponseObject, error) {
	policy, err := h.service.Policy(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetDisciplinePolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func (h *DisciplineHandler) UpdateDisciplinePolicy(ctx context.Context, request api.UpdateDisciplinePolicyRequestObject) (api.UpdateDisciplinePolicyResponseObject, error) {
	levels := make([]domain.SPLevel, len(request.Body.Levels))
	for i, l := range request.Body.Levels {
		levels[i] = domain.SPLevel{Level: l.Level, MinPoints: l.MinPoints, Label: l.Label}
	}
	policy, err := h.service.UpdatePolicy(ctx, tenantID(ctx), userID(ctx), levels)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateDisciplinePolicy200JSONResponse(toAPIPolicy(policy)), nil
}

func (h *DisciplineHandler) GetWarningLetterTemplatePolicy(ctx context.Context, _ api.GetWarningLetterTemplatePolicyRequestObject) (api.GetWarningLetterTemplatePolicyResponseObject, error) {
	policy, err := h.service.WarningLetterTemplatePolicy(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetWarningLetterTemplatePolicy200JSONResponse(toAPILetterTemplatePolicy(policy)), nil
}

func (h *DisciplineHandler) UpdateWarningLetterTemplatePolicy(ctx context.Context, request api.UpdateWarningLetterTemplatePolicyRequestObject) (api.UpdateWarningLetterTemplatePolicyResponseObject, error) {
	b := request.Body
	policy, err := h.service.UpdateWarningLetterTemplatePolicy(ctx, tenantID(ctx), userID(ctx), domain.WarningLetterTemplatePolicy{
		NumberPattern: b.NumberPattern, SeqPad: b.SeqPad, OpeningText: b.OpeningText, ClosingText: b.ClosingText,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateWarningLetterTemplatePolicy200JSONResponse(toAPILetterTemplatePolicy(policy)), nil
}

// Records.

func (h *DisciplineHandler) ListViolations(ctx context.Context, request api.ListViolationsRequestObject) (api.ListViolationsResponseObject, error) {
	p := request.Params
	f := service.RecordFilter{ClassID: nullUUID(p.ClassId), IncludeVoided: p.IncludeVoided != nil && *p.IncludeVoided, Limit: intOr(p.Limit, 50), Offset: intOr(p.Offset, 0)}
	if p.From != nil {
		f.From = &p.From.Time
	}
	if p.To != nil {
		f.To = &p.To.Time
	}
	records, err := h.service.ListRecords(ctx, tenantID(ctx), f)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListViolations200JSONResponse{Data: toAPIRecords(records)}, nil
}

func (h *DisciplineHandler) RecordViolation(ctx context.Context, request api.RecordViolationRequestObject) (api.RecordViolationResponseObject, error) {
	b := request.Body
	in := service.RecordInput{
		StudentUserID: b.StudentUserId, OccurredOn: b.OccurredOn.Time, Notes: strOr(b.Notes),
		AttendanceSessionID: nullUUID(b.AttendanceSessionId), WorkflowInstanceID: nullUUID(b.WorkflowInstanceId), ReporterUserID: userID(ctx),
	}
	if b.ViolationTypeId != nil {
		in.ViolationTypeID = *b.ViolationTypeId
	}
	if b.ViolationTypeIds != nil {
		in.ViolationTypeIDs = *b.ViolationTypeIds
	}
	result, err := h.service.RecordViolation(ctx, tenantID(ctx), in)
	if err != nil {
		return nil, mapError(err)
	}
	records := toAPIRecords(result.Records)
	return api.RecordViolation201JSONResponse{Record: toAPIRecord(result.Record), Records: &records, TotalPoints: result.TotalPoints, DueLevels: toAPILevels(result.DueLevels)}, nil
}

func (h *DisciplineHandler) VoidViolation(ctx context.Context, request api.VoidViolationRequestObject) (api.VoidViolationResponseObject, error) {
	record, err := h.service.VoidViolation(ctx, tenantID(ctx), request.RecordId, userID(ctx), request.Body.Reason)
	if err != nil {
		return nil, mapError(err)
	}
	return api.VoidViolation200JSONResponse(toAPIRecord(record)), nil
}

func (h *DisciplineHandler) GetStudentDiscipline(ctx context.Context, request api.GetStudentDisciplineRequestObject) (api.GetStudentDisciplineResponseObject, error) {
	summary, err := h.service.StudentSummary(ctx, tenantID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStudentDiscipline200JSONResponse{
		StudentUserId: summary.StudentUserID, TotalPoints: summary.TotalPoints, Records: toAPIRecords(summary.Records),
		Letters: toAPILetters(summary.Letters), DueLevels: toAPILevels(summary.DueLevels), Policy: toAPIPolicy(summary.Policy),
		FirstCrossed: toAPICrossings(summary.Policy, firstCrossedFromSummary(summary)),
	}, nil
}

// GetMyDiscipline is the student's own record; no discipline permission
// needed because the subject is always the caller.
func (h *DisciplineHandler) GetMyDiscipline(ctx context.Context, _ api.GetMyDisciplineRequestObject) (api.GetMyDisciplineResponseObject, error) {
	summary, err := h.service.StudentSummary(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMyDiscipline200JSONResponse{
		StudentUserId: summary.StudentUserID, TotalPoints: summary.TotalPoints, Records: toAPIRecords(summary.Records),
		Letters: toAPILetters(summary.Letters), DueLevels: toAPILevels(summary.DueLevels), Policy: toAPIPolicy(summary.Policy),
		FirstCrossed: toAPICrossings(summary.Policy, firstCrossedFromSummary(summary)),
	}, nil
}

// firstCrossedFromSummary computes the "Status SP" dates straight from the
// student's own records already fetched for the summary, rather than
// re-querying every student in the tenant the way the XLSX report's bulk
// FirstCrossedDates does -- this is a single-student read.
func firstCrossedFromSummary(summary service.StudentSummary) map[int]time.Time {
	records := make([]domain.PointRecord, 0, len(summary.Records))
	for _, r := range summary.Records {
		if r.IsVoided() {
			continue
		}
		records = append(records, domain.PointRecord{Points: r.PointsSnapshot, OccurredOn: r.OccurredOn})
	}
	return summary.Policy.FirstCrossedDates(records)
}

func (h *DisciplineHandler) GetStudentDisciplineReport(ctx context.Context, request api.GetStudentDisciplineReportRequestObject) (api.GetStudentDisciplineReportResponseObject, error) {
	url, err := h.service.StudentReportPDF(ctx, tenantID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetStudentDisciplineReport200JSONResponse{Url: url}, nil
}

func (h *DisciplineHandler) ListPointTotals(ctx context.Context, request api.ListPointTotalsRequestObject) (api.ListPointTotalsResponseObject, error) {
	totals, err := h.service.PointTotals(ctx, tenantID(ctx), nullUUID(request.Params.ClassId), intOr(request.Params.Limit, 100))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.PointTotal, len(totals))
	for i, t := range totals {
		item := api.PointTotal{StudentUserId: t.StudentUserID, TotalPoints: t.Total, RecordCount: t.RecordCount}
		if !t.LastOccurredOn.IsZero() {
			item.LastOccurredOn = &openapi_types.Date{Time: t.LastOccurredOn}
		}
		data[i] = item
	}
	return api.ListPointTotals200JSONResponse{Data: data}, nil
}

func (h *DisciplineHandler) ListSPCandidates(ctx context.Context, request api.ListSPCandidatesRequestObject) (api.ListSPCandidatesResponseObject, error) {
	p := request.Params
	candidates, err := h.service.ListSPCandidates(ctx, tenantID(ctx), nullUUID(p.ClassId), intOr(p.Level, 0), strOr(p.Search), intOr(p.Limit, 50), intOr(p.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.SPCandidate, len(candidates))
	for i, c := range candidates {
		levels := make([]int, len(c.IssuedLevels))
		copy(levels, c.IssuedLevels)
		data[i] = api.SPCandidate{StudentUserId: c.StudentUserID, StudentName: c.StudentName, Nis: c.NIS, ClassName: c.ClassName, TotalPoints: c.TotalPoints, IssuedLevels: levels}
	}
	return api.ListSPCandidates200JSONResponse{Data: data}, nil
}

// Letters.

func (h *DisciplineHandler) ListWarningLetters(ctx context.Context, request api.ListWarningLettersRequestObject) (api.ListWarningLettersResponseObject, error) {
	letters, err := h.service.ListWarningLetters(ctx, tenantID(ctx), nullUUID(request.Params.ClassId), intOr(request.Params.Limit, 50), intOr(request.Params.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListWarningLetters200JSONResponse{Data: toAPILetters(letters)}, nil
}

func (h *DisciplineHandler) IssueWarningLetter(ctx context.Context, request api.IssueWarningLetterRequestObject) (api.IssueWarningLetterResponseObject, error) {
	letter, err := h.service.IssueWarningLetter(ctx, tenantID(ctx), request.Body.StudentUserId, userID(ctx), request.Body.Level)
	if err != nil {
		return nil, mapError(err)
	}
	return api.IssueWarningLetter201JSONResponse(toAPILetter(letter)), nil
}

func (h *DisciplineHandler) GetWarningLetter(ctx context.Context, request api.GetWarningLetterRequestObject) (api.GetWarningLetterResponseObject, error) {
	letter, err := h.service.GetWarningLetter(ctx, tenantID(ctx), request.LetterId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetWarningLetter200JSONResponse(toAPILetter(letter)), nil
}

func (h *DisciplineHandler) GetWarningLetterDocumentUrl(ctx context.Context, request api.GetWarningLetterDocumentUrlRequestObject) (api.GetWarningLetterDocumentUrlResponseObject, error) {
	url, err := h.service.WarningLetterURL(ctx, tenantID(ctx), request.LetterId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetWarningLetterDocumentUrl200JSONResponse{Url: url}, nil
}

// Counseling.

func counselingInput(b *api.CounselingWrite) service.CounselingInput {
	visibility := domain.VisibilityCounselor
	if b.Visibility != nil {
		visibility = domain.Visibility(*b.Visibility)
	}
	topic := domain.CounselingTopic("")
	if b.Topic != nil {
		topic = domain.CounselingTopic(*b.Topic)
	}
	return service.CounselingInput{
		StudentUserID: b.StudentUserId, SessionAt: b.SessionAt, Kind: domain.CounselingKind(b.Kind), Topic: topic, Title: b.Title,
		Content: b.Content, FollowUpPlan: strOr(b.FollowUpPlan), CareerGoals: strOr(b.CareerGoals), ProblemDescription: strOr(b.ProblemDescription),
		Visibility: visibility,
	}
}

func (h *DisciplineHandler) ListMyCounselings(ctx context.Context, request api.ListMyCounselingsRequestObject) (api.ListMyCounselingsResponseObject, error) {
	notes, err := h.service.ListMyCounselings(ctx, tenantID(ctx), userID(ctx), intOr(request.Params.Limit, 50), intOr(request.Params.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListMyCounselings200JSONResponse{Data: toAPICounselings(notes)}, nil
}

func (h *DisciplineHandler) ListBKTeamCounselings(ctx context.Context, request api.ListBKTeamCounselingsRequestObject) (api.ListBKTeamCounselingsResponseObject, error) {
	topic := domain.CounselingTopic("")
	if request.Params.Topic != nil {
		topic = domain.CounselingTopic(*request.Params.Topic)
	}
	notes, err := h.service.ListBKTeamCounselings(ctx, tenantID(ctx), userID(ctx), topic, intOr(request.Params.Limit, 50), intOr(request.Params.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListBKTeamCounselings200JSONResponse{Data: toAPICounselings(notes)}, nil
}

func (h *DisciplineHandler) CreateCounseling(ctx context.Context, request api.CreateCounselingRequestObject) (api.CreateCounselingResponseObject, error) {
	note, err := h.service.CreateCounseling(ctx, tenantID(ctx), userID(ctx), counselingInput(request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateCounseling201JSONResponse(toAPICounseling(note)), nil
}

func (h *DisciplineHandler) GetCounseling(ctx context.Context, request api.GetCounselingRequestObject) (api.GetCounselingResponseObject, error) {
	note, err := h.service.GetCounseling(ctx, tenantID(ctx), request.CounselingId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetCounseling200JSONResponse(toAPICounseling(note)), nil
}

func (h *DisciplineHandler) UpdateCounseling(ctx context.Context, request api.UpdateCounselingRequestObject) (api.UpdateCounselingResponseObject, error) {
	note, err := h.service.UpdateCounseling(ctx, tenantID(ctx), request.CounselingId, userID(ctx), counselingInput(request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateCounseling200JSONResponse(toAPICounseling(note)), nil
}

func (h *DisciplineHandler) DeleteCounseling(ctx context.Context, request api.DeleteCounselingRequestObject) (api.DeleteCounselingResponseObject, error) {
	if err := h.service.DeleteCounseling(ctx, tenantID(ctx), request.CounselingId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteCounseling204Response{}, nil
}

func (h *DisciplineHandler) ListStudentCounselings(ctx context.Context, request api.ListStudentCounselingsRequestObject) (api.ListStudentCounselingsResponseObject, error) {
	notes, err := h.service.ListCounselingsForStudent(ctx, tenantID(ctx), request.StudentId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListStudentCounselings200JSONResponse{Data: toAPICounselings(notes)}, nil
}

func (h *DisciplineHandler) GetCounselingReport(ctx context.Context, request api.GetCounselingReportRequestObject) (api.GetCounselingReportResponseObject, error) {
	url, err := h.service.CounselingReportPDF(ctx, tenantID(ctx), request.CounselingId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetCounselingReport200JSONResponse{Url: url}, nil
}

func (h *DisciplineHandler) ListCounselingAttachments(ctx context.Context, request api.ListCounselingAttachmentsRequestObject) (api.ListCounselingAttachmentsResponseObject, error) {
	attachments, err := h.service.ListAttachments(ctx, tenantID(ctx), request.CounselingId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.CounselingAttachment, len(attachments))
	for i, a := range attachments {
		data[i] = api.CounselingAttachment{Id: a.ID, CounselingId: a.CounselingID, CreatedAt: a.CreatedAt}
	}
	return api.ListCounselingAttachments200JSONResponse{Data: data}, nil
}

func (h *DisciplineHandler) RequestCounselingAttachmentUpload(ctx context.Context, request api.RequestCounselingAttachmentUploadRequestObject) (api.RequestCounselingAttachmentUploadResponseObject, error) {
	target, err := h.service.RequestAttachmentUpload(ctx, tenantID(ctx), request.CounselingId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RequestCounselingAttachmentUpload200JSONResponse{UploadUrl: target.UploadURL, ObjectKey: target.ObjectKey, ExpiresAt: target.ExpiresAt}, nil
}

func (h *DisciplineHandler) ConfirmCounselingAttachment(ctx context.Context, request api.ConfirmCounselingAttachmentRequestObject) (api.ConfirmCounselingAttachmentResponseObject, error) {
	att, err := h.service.ConfirmAttachment(ctx, tenantID(ctx), request.CounselingId, userID(ctx), request.Body.ObjectKey)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ConfirmCounselingAttachment201JSONResponse{Id: att.ID, CounselingId: att.CounselingID, CreatedAt: att.CreatedAt}, nil
}

func (h *DisciplineHandler) GetCounselingAttachmentUrl(ctx context.Context, request api.GetCounselingAttachmentUrlRequestObject) (api.GetCounselingAttachmentUrlResponseObject, error) {
	url, err := h.service.AttachmentURL(ctx, tenantID(ctx), request.CounselingId, request.AttachmentId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetCounselingAttachmentUrl200JSONResponse{Url: url}, nil
}

// Conversions.

func toAPIType(t domain.ViolationType) api.ViolationType {
	return api.ViolationType{Id: t.ID, Code: t.Code, Name: t.Name, Points: t.Points, Category: t.Category, IsActive: t.IsActive}
}

func toAPILevels(levels []domain.SPLevel) []api.SPLevel {
	out := make([]api.SPLevel, len(levels))
	for i, l := range levels {
		out[i] = api.SPLevel{Level: l.Level, MinPoints: l.MinPoints, Label: l.Label}
	}
	return out
}

func toAPIPolicy(p domain.SPPolicy) api.SPPolicy {
	return api.SPPolicy{Version: p.Version, Levels: toAPILevels(p.Levels)}
}

func toAPILetterTemplatePolicy(p domain.WarningLetterTemplatePolicy) api.WarningLetterTemplatePolicy {
	return api.WarningLetterTemplatePolicy{NumberPattern: p.NumberPattern, SeqPad: p.SeqPad, OpeningText: p.OpeningText, ClosingText: p.ClosingText}
}

// toAPICrossings orders a student's first-crossed dates by level and
// labels each with the policy's current label for that level.
func toAPICrossings(policy domain.SPPolicy, crossed map[int]time.Time) []api.SPCrossing {
	out := make([]api.SPCrossing, 0, len(crossed))
	for _, lvl := range policy.Levels {
		date, ok := crossed[lvl.Level]
		if !ok {
			continue
		}
		out = append(out, api.SPCrossing{Level: lvl.Level, Label: lvl.Label, OccurredOn: openapi_types.Date{Time: date}})
	}
	return out
}

func toAPIRecord(r domain.ViolationRecord) api.ViolationRecord {
	out := api.ViolationRecord{
		Id: r.ID, StudentUserId: r.StudentUserID, ViolationTypeId: r.ViolationTypeID, TypeName: r.TypeName, Points: r.PointsSnapshot,
		OccurredOn: openapi_types.Date{Time: r.OccurredOn}, ReporterUserId: r.ReporterUserID, Notes: r.Notes, CreatedAt: r.CreatedAt, IsVoided: r.IsVoided(),
		AttendanceSessionId: uuidPtr(r.AttendanceSessionID), WorkflowInstanceId: uuidPtr(r.WorkflowInstanceID), VoidedAt: r.VoidedAt,
	}
	if r.TypeCode != "" {
		code := r.TypeCode
		out.TypeCode = &code
	}
	if r.TypeCategory != "" {
		cat := r.TypeCategory
		out.TypeCategory = &cat
	}
	if r.VoidReason != "" {
		reason := r.VoidReason
		out.VoidReason = &reason
	}
	return out
}

func toAPIRecords(records []domain.ViolationRecord) []api.ViolationRecord {
	out := make([]api.ViolationRecord, len(records))
	for i, r := range records {
		out[i] = toAPIRecord(r)
	}
	return out
}

func toAPILetter(l domain.WarningLetter) api.WarningLetter {
	return api.WarningLetter{
		Id: l.ID, StudentUserId: l.StudentUserID, Level: l.Level, LevelLabel: l.LevelLabel, ThresholdPoints: l.ThresholdPoints, TotalPoints: l.TotalPoints,
		LetterNumber: l.LetterNumber, IssuedBy: uuidPtr(l.IssuedBy), IssuedAt: l.IssuedAt, HasDocument: l.DocumentAssetID.Valid,
	}
}

func toAPILetters(letters []domain.WarningLetter) []api.WarningLetter {
	out := make([]api.WarningLetter, len(letters))
	for i, l := range letters {
		out[i] = toAPILetter(l)
	}
	return out
}

func toAPICounseling(c domain.Counseling) api.Counseling {
	out := api.Counseling{
		Id: c.ID, StudentUserId: c.StudentUserID, CounselorUserId: c.CounselorUserID, SessionAt: c.SessionAt, Kind: api.CounselingKind(c.Kind),
		Topic: api.CounselingTopic(c.Topic), Title: c.Title, Content: c.Content, Visibility: api.CounselingVisibility(c.Visibility), CreatedAt: c.CreatedAt,
	}
	if c.FollowUpPlan != "" {
		plan := c.FollowUpPlan
		out.FollowUpPlan = &plan
	}
	if c.CareerGoals != "" {
		goals := c.CareerGoals
		out.CareerGoals = &goals
	}
	if c.ProblemDescription != "" {
		desc := c.ProblemDescription
		out.ProblemDescription = &desc
	}
	if !c.UpdatedAt.IsZero() {
		updated := c.UpdatedAt
		out.UpdatedAt = &updated
	}
	return out
}

func toAPICounselings(notes []domain.Counseling) []api.Counseling {
	out := make([]api.Counseling, len(notes))
	for i, n := range notes {
		out[i] = toAPICounseling(n)
	}
	return out
}
