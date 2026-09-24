package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

type PermitsHandler struct {
	service *service.Service
	clock   clock.Clock
}

func New(svc *service.Service, clk clock.Clock) *PermitsHandler {
	return &PermitsHandler{service: svc, clock: clk}
}

func tenantID(ctx context.Context) uuid.UUID {
	id, _ := httpx.TenantIDFromContext(ctx)
	return id
}

func userID(ctx context.Context) uuid.UUID {
	id, _ := httpx.UserIDFromContext(ctx)
	return id
}

// Scan tokens and classroom entry.

func (h *PermitsHandler) IssueScanToken(ctx context.Context, request api.IssueScanTokenRequestObject) (api.IssueScanTokenResponseObject, error) {
	in := service.IssueScanTokenInput{TenantID: tenantID(ctx), Purpose: domain.Purpose(request.Body.Purpose), IssuedByUserID: userID(ctx)}
	if request.Body.ContextId != nil {
		in.ContextID = uuid.NullUUID{UUID: *request.Body.ContextId, Valid: true}
	}
	if in.Purpose == domain.PurposeApproveStage && !in.ContextID.Valid {
		return nil, httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "context_id", Code: "REQUIRED"})
	}
	if in.Purpose == domain.PurposeGateExit {
		return nil, httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "purpose", Code: "USE_GATE_TOKEN_ENDPOINT"})
	}
	result, err := h.service.IssueScanToken(ctx, in)
	if err != nil {
		return nil, mapError(err)
	}
	return api.IssueScanToken201JSONResponse(toAPIToken(result, h.clock.Now())), nil
}

func (h *PermitsHandler) ScanClassroomEntry(ctx context.Context, request api.ScanClassroomEntryRequestObject) (api.ScanClassroomEntryResponseObject, error) {
	reason := ""
	if request.Body.Reason != nil {
		reason = *request.Body.Reason
	}
	tenant, student := tenantID(ctx), userID(ctx)
	result, err := h.service.ScanClassroomEntry(ctx, service.ScanClassroomEntryInput{
		TenantID: tenant, StudentUserID: student, RawToken: request.Body.Token, Reason: reason,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScanClassroomEntry200JSONResponse{TeacherUserId: result.TeacherUserID, TeacherName: result.TeacherName, ScannedAt: h.clock.Now()}, nil
}

// Workflow definitions.

func (h *PermitsHandler) ListWorkflowDefinitions(ctx context.Context, _ api.ListWorkflowDefinitionsRequestObject) (api.ListWorkflowDefinitionsResponseObject, error) {
	defs, err := h.service.ListDefinitions(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.WorkflowDefinition, len(defs))
	for i, d := range defs {
		data[i] = toAPIDefinition(d)
	}
	return api.ListWorkflowDefinitions200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) ReplaceWorkflowDefinition(ctx context.Context, request api.ReplaceWorkflowDefinitionRequestObject) (api.ReplaceWorkflowDefinitionResponseObject, error) {
	stages := make([]domain.Stage, len(request.Body.Stages))
	for i, s := range request.Body.Stages {
		stages[i] = fromAPIStage(s)
	}
	cfg := map[string]any{}
	if request.Body.Config != nil {
		cfg = *request.Body.Config
	}
	def, err := h.service.ReplaceDefinition(ctx, tenantID(ctx), domain.Kind(request.Kind), stages, cfg, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReplaceWorkflowDefinition200JSONResponse(toAPIDefinition(def)), nil
}

// Exit permits.

func (h *PermitsHandler) exitPermitDetail(ctx context.Context, tenant, instanceID uuid.UUID) (api.ExitPermitDetail, error) {
	d, err := h.service.GetExitPermit(ctx, tenant, instanceID)
	if err != nil {
		return api.ExitPermitDetail{}, mapError(err)
	}
	return toAPIExitPermit(d.Instance, d.Definition, d.Permit, d.Events), nil
}

func (h *PermitsHandler) ListMyExitPermits(ctx context.Context, request api.ListMyExitPermitsRequestObject) (api.ListMyExitPermitsResponseObject, error) {
	limit, offset := 25, 0
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	if request.Params.Offset != nil {
		offset = *request.Params.Offset
	}
	items, err := h.service.ListMyExitPermits(ctx, tenantID(ctx), userID(ctx), limit, offset)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.WorkflowInstance, len(items))
	for i, it := range items {
		data[i] = toAPIInstance(it.Instance, it.Definition, nil)
	}
	return api.ListMyExitPermits200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) ListExitPermitsForApproval(ctx context.Context, _ api.ListExitPermitsForApprovalRequestObject) (api.ListExitPermitsForApprovalResponseObject, error) {
	items, err := h.service.ListExitPermitsForApproval(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.ExitPermitSummary, len(items))
	for i, it := range items {
		data[i] = toAPIExitPermitSummary(it)
	}
	return api.ListExitPermitsForApproval200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) CreateExitPermit(ctx context.Context, request api.CreateExitPermitRequestObject) (api.CreateExitPermitResponseObject, error) {
	tenant := tenantID(ctx)
	inst, _, err := h.service.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: tenant, StudentUserID: userID(ctx), Destination: request.Body.Destination,
		StartPeriodID: request.Body.StartPeriodId, EndPeriodID: request.Body.EndPeriodId,
	})
	if err != nil {
		return nil, mapError(err)
	}
	detail, err := h.exitPermitDetail(ctx, tenant, inst.ID)
	if err != nil {
		return nil, err
	}
	return api.CreateExitPermit201JSONResponse(detail), nil
}

func (h *PermitsHandler) GetExitPermit(ctx context.Context, request api.GetExitPermitRequestObject) (api.GetExitPermitResponseObject, error) {
	tenant := tenantID(ctx)
	if err := h.service.RequireCanViewExitPermit(ctx, tenant, request.InstanceId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.exitPermitDetail(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, err
	}
	return api.GetExitPermit200JSONResponse(detail), nil
}

func (h *PermitsHandler) ScanExitPermitStage(ctx context.Context, request api.ScanExitPermitStageRequestObject) (api.ScanExitPermitStageResponseObject, error) {
	tenant := tenantID(ctx)
	if _, err := h.service.ExitPermitScan(ctx, tenant, request.InstanceId, userID(ctx), request.Body.Token); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.exitPermitDetail(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, err
	}
	return api.ScanExitPermitStage200JSONResponse(detail), nil
}

func (h *PermitsHandler) CancelExitPermit(ctx context.Context, request api.CancelExitPermitRequestObject) (api.CancelExitPermitResponseObject, error) {
	tenant := tenantID(ctx)
	if err := h.service.RequireSubject(ctx, tenant, request.InstanceId, userID(ctx), domain.KindExitPermit); err != nil {
		return nil, mapError(err)
	}
	if _, err := h.service.CancelExitPermit(ctx, tenant, request.InstanceId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.exitPermitDetail(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, err
	}
	return api.CancelExitPermit200JSONResponse(detail), nil
}

func (h *PermitsHandler) IssueExitPermitGateToken(ctx context.Context, request api.IssueExitPermitGateTokenRequestObject) (api.IssueExitPermitGateTokenResponseObject, error) {
	tenant := tenantID(ctx)
	if err := h.service.RequireSubject(ctx, tenant, request.InstanceId, userID(ctx), domain.KindExitPermit); err != nil {
		return nil, mapError(err)
	}
	result, err := h.service.IssueGateToken(ctx, tenant, request.InstanceId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.IssueExitPermitGateToken201JSONResponse(toAPIToken(result, h.clock.Now())), nil
}

func (h *PermitsHandler) ScanExitPermitGate(ctx context.Context, request api.ScanExitPermitGateRequestObject) (api.ScanExitPermitGateResponseObject, error) {
	tenant := tenantID(ctx)
	if _, err := h.service.GateScan(ctx, tenant, request.InstanceId, userID(ctx), request.Body.Token); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.exitPermitDetail(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, err
	}
	return api.ScanExitPermitGate200JSONResponse(detail), nil
}

// Late arrivals.

func (h *PermitsHandler) OpenLateArrival(ctx context.Context, request api.OpenLateArrivalRequestObject) (api.OpenLateArrivalResponseObject, error) {
	reason := ""
	if request.Body.Reason != nil {
		reason = *request.Body.Reason
	}
	detail, err := h.service.OpenLateArrival(ctx, service.OpenLateArrivalInput{
		TenantID: tenantID(ctx), StudentUserID: userID(ctx), RawToken: request.Body.Token, Reason: reason,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.OpenLateArrival201JSONResponse(toAPILateArrival(detail)), nil
}

func (h *PermitsHandler) GetCurrentLateArrival(ctx context.Context, _ api.GetCurrentLateArrivalRequestObject) (api.GetCurrentLateArrivalResponseObject, error) {
	detail, found, err := h.service.CurrentLateArrival(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	if !found {
		return nil, httpx.ErrNotFound
	}
	return api.GetCurrentLateArrival200JSONResponse(toAPILateArrival(detail)), nil
}

func (h *PermitsHandler) ListLateArrivalsForReview(ctx context.Context, _ api.ListLateArrivalsForReviewRequestObject) (api.ListLateArrivalsForReviewResponseObject, error) {
	items, err := h.service.ListLateArrivalsForReview(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LateArrivalSummary, len(items))
	for i, it := range items {
		data[i] = toAPILateArrivalSummary(it)
	}
	return api.ListLateArrivalsForReview200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) GetLateArrival(ctx context.Context, request api.GetLateArrivalRequestObject) (api.GetLateArrivalResponseObject, error) {
	tenant := tenantID(ctx)
	if err := h.service.RequireCanViewLateArrival(ctx, tenant, request.InstanceId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLateArrival(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLateArrival200JSONResponse(toAPILateArrival(detail)), nil
}

func (h *PermitsHandler) ReviewLateArrival(ctx context.Context, request api.ReviewLateArrivalRequestObject) (api.ReviewLateArrivalResponseObject, error) {
	in := service.ReviewLateArrivalInput{
		TenantID: tenantID(ctx), InstanceID: request.InstanceId, ReviewerUserID: userID(ctx), HomeroomReported: request.Body.HomeroomReported,
	}
	if request.Body.Reason != nil {
		in.Reason = *request.Body.Reason
	}
	if request.Body.ViolationIds != nil {
		in.ViolationIDs = *request.Body.ViolationIds
	}
	detail, err := h.service.ReviewLateArrival(ctx, in)
	if err != nil {
		return nil, mapError(err)
	}
	full, err := h.service.GetLateArrival(ctx, in.TenantID, in.InstanceID)
	if err == nil {
		detail = full
	}
	return api.ReviewLateArrival200JSONResponse(toAPILateArrival(detail)), nil
}

func (h *PermitsHandler) ScanLateArrivalStage(ctx context.Context, request api.ScanLateArrivalStageRequestObject) (api.ScanLateArrivalStageResponseObject, error) {
	tenant := tenantID(ctx)
	if _, err := h.service.LateArrivalScan(ctx, tenant, request.InstanceId, userID(ctx), request.Body.Token); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLateArrival(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScanLateArrivalStage200JSONResponse(toAPILateArrival(detail)), nil
}

// Leave requests.

func (h *PermitsHandler) ListMyLeaveRequests(ctx context.Context, request api.ListMyLeaveRequestsRequestObject) (api.ListMyLeaveRequestsResponseObject, error) {
	limit, offset := 25, 0
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	if request.Params.Offset != nil {
		offset = *request.Params.Offset
	}
	items, err := h.service.ListMyLeaveRequests(ctx, tenantID(ctx), userID(ctx), limit, offset)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LeaveRequestSummary, len(items))
	for i, it := range items {
		data[i] = toAPILeaveSummary(it)
	}
	return api.ListMyLeaveRequests200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) SubmitLeaveRequest(ctx context.Context, request api.SubmitLeaveRequestRequestObject) (api.SubmitLeaveRequestResponseObject, error) {
	tenant := tenantID(ctx)
	actor := userID(ctx)
	created, err := h.service.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: tenant, ActorUserID: actor, StudentUserID: actor, Category: domain.Category(request.Body.Category), Reason: request.Body.Reason,
		StartsOn: request.Body.StartsOn.Time, EndsOn: request.Body.EndsOn.Time,
	})
	if err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLeaveRequest(ctx, tenant, created.Instance.ID)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SubmitLeaveRequest201JSONResponse(toAPILeaveRequest(detail)), nil
}

func (h *PermitsHandler) ListLeaveRequestsForReview(ctx context.Context, request api.ListLeaveRequestsForReviewRequestObject) (api.ListLeaveRequestsForReviewResponseObject, error) {
	classID := uuid.NullUUID{}
	if request.Params.ClassId != nil {
		classID = uuid.NullUUID{UUID: *request.Params.ClassId, Valid: true}
	}
	items, err := h.service.ListLeaveRequestsForReview(ctx, tenantID(ctx), userID(ctx), classID)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LeaveRequestSummary, len(items))
	for i, it := range items {
		data[i] = toAPILeaveSummary(it)
	}
	return api.ListLeaveRequestsForReview200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) ListLeaveRequestsForGuardianReview(ctx context.Context, _ api.ListLeaveRequestsForGuardianReviewRequestObject) (api.ListLeaveRequestsForGuardianReviewResponseObject, error) {
	items, err := h.service.ListLeaveRequestsForGuardianReview(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LeaveRequestSummary, len(items))
	for i, it := range items {
		data[i] = toAPILeaveSummary(it)
	}
	return api.ListLeaveRequestsForGuardianReview200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) ReviewLeaveRequestAsGuardian(ctx context.Context, request api.ReviewLeaveRequestAsGuardianRequestObject) (api.ReviewLeaveRequestAsGuardianResponseObject, error) {
	tenant := tenantID(ctx)
	note := ""
	if request.Body.Note != nil {
		note = *request.Body.Note
	}
	if _, err := h.service.ReviewLeaveRequestAsGuardian(ctx, tenant, request.InstanceId, userID(ctx), request.Body.Approve, note); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLeaveRequest(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReviewLeaveRequestAsGuardian200JSONResponse(toAPILeaveRequest(detail)), nil
}

func (h *PermitsHandler) GetLeaveRequest(ctx context.Context, request api.GetLeaveRequestRequestObject) (api.GetLeaveRequestResponseObject, error) {
	tenant := tenantID(ctx)
	if err := h.service.RequireCanViewLeaveRequest(ctx, tenant, request.InstanceId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLeaveRequest(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLeaveRequest200JSONResponse(toAPILeaveRequest(detail)), nil
}

func (h *PermitsHandler) RequestLeaveEvidenceUpload(ctx context.Context, request api.RequestLeaveEvidenceUploadRequestObject) (api.RequestLeaveEvidenceUploadResponseObject, error) {
	target, err := h.service.RequestEvidenceUpload(ctx, tenantID(ctx), request.InstanceId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RequestLeaveEvidenceUpload200JSONResponse{UploadUrl: target.UploadURL, ObjectKey: target.ObjectKey, ExpiresAt: target.ExpiresAt}, nil
}

func (h *PermitsHandler) ConfirmLeaveEvidence(ctx context.Context, request api.ConfirmLeaveEvidenceRequestObject) (api.ConfirmLeaveEvidenceResponseObject, error) {
	if err := h.service.ConfirmEvidence(ctx, tenantID(ctx), request.InstanceId, userID(ctx), request.Body.ObjectKey); err != nil {
		return nil, mapError(err)
	}
	return api.ConfirmLeaveEvidence204Response{}, nil
}

func (h *PermitsHandler) ReviewLeaveRequest(ctx context.Context, request api.ReviewLeaveRequestRequestObject) (api.ReviewLeaveRequestResponseObject, error) {
	tenant := tenantID(ctx)
	note := ""
	if request.Body.Note != nil {
		note = *request.Body.Note
	}
	if _, err := h.service.ReviewLeaveRequest(ctx, tenant, request.InstanceId, userID(ctx), request.Body.Approve, note); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLeaveRequest(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReviewLeaveRequest200JSONResponse(toAPILeaveRequest(detail)), nil
}

func (h *PermitsHandler) IssueLeaveLetter(ctx context.Context, request api.IssueLeaveLetterRequestObject) (api.IssueLeaveLetterResponseObject, error) {
	tenant := tenantID(ctx)
	if _, err := h.service.IssueLeaveLetter(ctx, tenant, request.InstanceId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	detail, err := h.service.GetLeaveRequest(ctx, tenant, request.InstanceId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.IssueLeaveLetter200JSONResponse(toAPILeaveRequest(detail)), nil
}

func (h *PermitsHandler) GetLeaveDocumentUrl(ctx context.Context, request api.GetLeaveDocumentUrlRequestObject) (api.GetLeaveDocumentUrlResponseObject, error) {
	tenant := tenantID(ctx)
	if err := h.service.RequireCanViewLeaveRequest(ctx, tenant, request.InstanceId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	url, err := h.service.DocumentDownloadURL(ctx, tenant, request.InstanceId, domain.DocumentKind(request.Kind))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLeaveDocumentUrl200JSONResponse{Url: url, ExpiresInSeconds: int(storage.DefaultUploadURLTTL.Seconds())}, nil
}

// Documents.

func (h *PermitsHandler) VerifyDocument(ctx context.Context, request api.VerifyDocumentRequestObject) (api.VerifyDocumentResponseObject, error) {
	v, err := h.service.VerifyDocument(ctx, tenantID(ctx), request.Code)
	if err != nil {
		return nil, mapError(err)
	}
	return api.VerifyDocument200JSONResponse{
		Number: v.Number, Kind: v.Kind, IssuedAt: v.IssuedAt, Revoked: v.Revoked,
		StudentName: strPtr(v.StudentName), ClassName: strPtr(v.ClassName), ValidFrom: datePtr(v.ValidFrom), ValidUntil: datePtr(v.ValidUntil),
	}, nil
}

func (h *PermitsHandler) ListDocumentTemplates(ctx context.Context, _ api.ListDocumentTemplatesRequestObject) (api.ListDocumentTemplatesResponseObject, error) {
	items, err := h.service.ListTemplates(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.DocumentTemplate, len(items))
	for i, t := range items {
		data[i] = toAPITemplate(t)
	}
	return api.ListDocumentTemplates200JSONResponse{Data: data}, nil
}

func (h *PermitsHandler) CreateDocumentTemplate(ctx context.Context, request api.CreateDocumentTemplateRequestObject) (api.CreateDocumentTemplateResponseObject, error) {
	b := request.Body
	t := domain.Template{
		TenantID: tenantID(ctx), Kind: domain.TemplateKind(b.Kind), Name: b.Name, Engine: domain.EngineHTML, Body: b.Body,
		IsDefault: b.IsDefault != nil && *b.IsDefault, CreatedBy: uuid.NullUUID{UUID: userID(ctx), Valid: true},
		LetterheadAssetID: nullUUIDFromPtr(b.LetterheadAssetId),
	}
	if b.Variables != nil {
		t.Variables = *b.Variables
	}
	created, err := h.service.CreateTemplate(ctx, t)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateDocumentTemplate201JSONResponse(toAPITemplate(created)), nil
}

func (h *PermitsHandler) UpdateDocumentTemplate(ctx context.Context, request api.UpdateDocumentTemplateRequestObject) (api.UpdateDocumentTemplateResponseObject, error) {
	var vars []string
	if request.Body.Variables != nil {
		vars = *request.Body.Variables
	}
	updated, err := h.service.UpdateTemplate(ctx, tenantID(ctx), request.TemplateId, request.Body.Name, request.Body.Body, vars, nullUUIDFromPtr(request.Body.LetterheadAssetId))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateDocumentTemplate200JSONResponse(toAPITemplate(updated)), nil
}

func (h *PermitsHandler) SetDefaultDocumentTemplate(ctx context.Context, request api.SetDefaultDocumentTemplateRequestObject) (api.SetDefaultDocumentTemplateResponseObject, error) {
	updated, err := h.service.SetDefaultTemplate(ctx, tenantID(ctx), request.TemplateId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SetDefaultDocumentTemplate200JSONResponse(toAPITemplate(updated)), nil
}
