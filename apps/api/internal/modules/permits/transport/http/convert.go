// Package http implements the permits slice of api.StrictServerInterface:
// request/response mapping only.
package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

var (
	errTokenGone           = httpx.NewError(http.StatusGone, "SCAN_TOKEN_GONE")
	errApproverNotEligible = httpx.NewError(http.StatusForbidden, "WORKFLOW_APPROVER_NOT_ELIGIBLE")
	errAlreadyInProgress   = httpx.NewError(http.StatusConflict, "WORKFLOW_ALREADY_IN_PROGRESS")
	errNotInProgress       = httpx.NewError(http.StatusConflict, "WORKFLOW_NOT_IN_PROGRESS")
	errNotSubject          = httpx.NewError(http.StatusForbidden, "WORKFLOW_NOT_SUBJECT")
	errAcademicYear        = httpx.NewError(http.StatusConflict, "ACADEMIC_YEAR_REQUIRED")
	errEnrollment          = httpx.NewError(http.StatusConflict, "ENROLLMENT_NOT_FOUND")
	errPeriodRange         = httpx.NewError(http.StatusBadRequest, "PERIOD_RANGE_INVALID")
	errExitNotIssued       = httpx.NewError(http.StatusConflict, "EXIT_PERMIT_NOT_ISSUED")
	errLeaveDates          = httpx.NewError(http.StatusBadRequest, "LEAVE_DATE_RANGE_INVALID")
	errLeaveNotReviewable  = httpx.NewError(http.StatusConflict, "LEAVE_REQUEST_NOT_REVIEWABLE")
	errLeaveNotIssuable    = httpx.NewError(http.StatusConflict, "LEAVE_REQUEST_NOT_ISSUABLE")
	errEvidenceTooLarge    = httpx.NewError(http.StatusBadRequest, "EVIDENCE_TOO_LARGE")
	errEvidenceType        = httpx.NewError(http.StatusBadRequest, "EVIDENCE_INVALID_TYPE")
	errDefinitionInvalid   = httpx.NewError(http.StatusBadRequest, "WORKFLOW_DEFINITION_INVALID")
)

var permitErrorMap = map[error]error{
	domain.ErrDefinitionNotFound:           httpx.ErrNotFound,
	domain.ErrDefinitionInvalid:            errDefinitionInvalid,
	domain.ErrInstanceNotFound:             httpx.ErrNotFound,
	domain.ErrInstanceNotInProgress:        errNotInProgress,
	domain.ErrStageIndexOutOfRange:         errNotInProgress,
	domain.ErrApproverNotEligible:          errApproverNotEligible,
	domain.ErrApproverNotDistinct:          errApproverNotEligible,
	domain.ErrAlreadyInProgress:            errAlreadyInProgress,
	domain.ErrNotWorkflowSubject:           errNotSubject,
	domain.ErrAcademicYearRequired:         errAcademicYear,
	domain.ErrEnrollmentNotFound:           errEnrollment,
	domain.ErrPeriodRangeInvalid:           errPeriodRange,
	domain.ErrTokenNotFound:                errTokenGone,
	domain.ErrTokenExpired:                 errTokenGone,
	domain.ErrTokenConsumed:                errTokenGone,
	domain.ErrTokenPurposeMismatch:         errTokenGone,
	domain.ErrTokenContextMismatch:         errTokenGone,
	domain.ErrExitPermitNotIssued:          errExitNotIssued,
	domain.ErrExitPermitExited:             errNotInProgress,
	domain.ErrLeaveRequestDateRangeInvalid: errLeaveDates,
	domain.ErrLeaveRequestNotReviewable:    errLeaveNotReviewable,
	domain.ErrLeaveRequestNotIssuable:      errLeaveNotIssuable,
	domain.ErrEvidenceTooLarge:             errEvidenceTooLarge,
	domain.ErrEvidenceInvalidType:          errEvidenceType,
	domain.ErrTemplateNotFound:             httpx.ErrNotFound,
	domain.ErrDocumentNotFound:             httpx.ErrNotFound,
	domain.ErrDocumentRevoked:              httpx.ErrNotFound,
}

func mapError(err error) error {
	for domainErr, httpErr := range permitErrorMap {
		if errors.Is(err, domainErr) {
			return httpErr
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.ErrInternal
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func uuidPtr(n uuid.NullUUID) *openapi_types.UUID {
	if !n.Valid {
		return nil
	}
	v := n.UUID
	return &v
}

func datePtr(t time.Time) *openapi_types.Date {
	if t.IsZero() {
		return nil
	}
	return &openapi_types.Date{Time: t}
}

func toAPIStage(s domain.Stage) api.WorkflowStage {
	out := api.WorkflowStage{Key: s.Key, Label: s.Label, ApproverRule: s.ApproverRule, Verification: api.WorkflowStageVerification(s.Verification)}
	if len(s.DistinctFrom) > 0 {
		d := append([]string(nil), s.DistinctFrom...)
		out.DistinctFrom = &d
	}
	if s.LookaheadSlots > 0 {
		l := s.LookaheadSlots
		out.LookaheadSlots = &l
	}
	return out
}

func fromAPIStage(s api.WorkflowStage) domain.Stage {
	out := domain.Stage{Key: s.Key, Label: s.Label, ApproverRule: s.ApproverRule, Verification: domain.Verification(s.Verification)}
	if s.DistinctFrom != nil {
		out.DistinctFrom = *s.DistinctFrom
	}
	if s.LookaheadSlots != nil {
		out.LookaheadSlots = *s.LookaheadSlots
	}
	return out
}

func toAPIDefinition(d domain.Definition) api.WorkflowDefinition {
	stages := make([]api.WorkflowStage, len(d.Stages))
	for i, s := range d.Stages {
		stages[i] = toAPIStage(s)
	}
	out := api.WorkflowDefinition{Id: d.ID, Kind: api.WorkflowKind(d.Kind), Version: d.Version, IsActive: d.IsActive, Stages: stages}
	if len(d.Config) > 0 {
		cfg := d.Config
		out.Config = &cfg
	}
	if !d.CreatedAt.IsZero() {
		t := d.CreatedAt
		out.CreatedAt = &t
	}
	return out
}

func toAPIEvent(e domain.Event) api.WorkflowEvent {
	return api.WorkflowEvent{
		Id: e.ID, StageKey: strPtr(e.StageKey), FromStatus: strPtr(string(e.FromStatus)), ToStatus: string(e.ToStatus),
		ActorUserId: uuidPtr(e.ActorUserID), Verification: string(e.Verification), Note: strPtr(e.Note), OccurredAt: e.OccurredAt,
	}
}

func toAPIInstance(inst domain.Instance, def domain.Definition, events []domain.Event) api.WorkflowInstance {
	stages := make([]api.WorkflowStage, len(def.Stages))
	for i, s := range def.Stages {
		stages[i] = toAPIStage(s)
	}
	out := api.WorkflowInstance{
		Id: inst.ID, Kind: api.WorkflowKind(inst.Kind), Status: api.WorkflowStatus(inst.Status), CurrentStageIndex: inst.CurrentStageIndex,
		Stages: stages, SubjectUserId: inst.SubjectUserID, ClassId: uuidPtr(inst.ClassID), OpenedAt: inst.OpenedAt, ClosedAt: inst.ClosedAt,
	}
	if inst.Status == domain.StatusInProgress {
		if stage, err := def.StageAt(inst.CurrentStageIndex); err == nil {
			s := toAPIStage(stage)
			out.CurrentStage = &s
		}
	}
	if events != nil {
		list := make([]api.WorkflowEvent, len(events))
		for i, e := range events {
			list[i] = toAPIEvent(e)
		}
		out.Events = &list
	}
	return out
}

func toAPIToken(r domain.IssueResult, now time.Time) api.IssuedScanToken {
	return api.IssuedScanToken{
		Token: r.RawValue, Purpose: api.ScanPurpose(r.Token.Purpose), ContextId: uuidPtr(r.Token.ContextID),
		ExpiresAt: r.ExpiresAt, ExpiresInSeconds: int(r.ExpiresAt.Sub(now).Seconds()),
	}
}

func toAPIExitPermit(inst domain.Instance, def domain.Definition, p domain.ExitPermit, events []domain.Event) api.ExitPermitDetail {
	return api.ExitPermitDetail{
		Instance: toAPIInstance(inst, def, events), Destination: p.Destination, StartPeriodId: p.StartPeriodID, EndPeriodId: p.EndPeriodID,
		IssuedAt: p.IssuedAt, ExitedAt: p.ExitedAt, StudentName: p.StudentNameSnapshot, ClassName: p.ClassNameSnapshot,
	}
}

func toAPILateArrival(d service.LateArrivalDetail) api.LateArrivalDetail {
	return api.LateArrivalDetail{
		Instance: toAPIInstance(d.Instance, d.Definition, d.Events), Reason: d.LateArrival.Reason, OccurrenceNumber: d.LateArrival.OccurrenceNumber,
		RequiredAction: api.RequiredAction(d.LateArrival.RequiredAction), HomeroomReported: d.LateArrival.HomeroomReported, CompletedAt: d.LateArrival.CompletedAt,
	}
}

func toAPILateArrivalSummary(i service.LateArrivalReviewItem) api.LateArrivalSummary {
	reported := i.HomeroomReported
	return api.LateArrivalSummary{
		InstanceId: i.InstanceID, StudentUserId: i.SubjectUserID, ClassId: uuidPtr(i.ClassID), Status: api.WorkflowStatus(i.Status),
		CurrentStageIndex: i.CurrentStageIndex, Reason: i.Reason, OccurrenceNumber: i.OccurrenceNumber,
		RequiredAction: api.RequiredAction(i.RequiredAction), HomeroomReported: &reported, OpenedAt: i.OpenedAt,
	}
}

func toAPILeaveRequest(d service.LeaveRequestDetail) api.LeaveRequestDetail {
	lr := d.LeaveRequest
	return api.LeaveRequestDetail{
		Instance: toAPIInstance(d.Instance, d.Definition, d.Events), Category: api.LeaveCategory(lr.Category), Reason: lr.Reason,
		StartsOn: openapi_types.Date{Time: lr.StartsOn}, EndsOn: openapi_types.Date{Time: lr.EndsOn},
		LetterNumber: strPtr(lr.LetterNumber), IssuedAt: lr.IssuedAt, StudentName: lr.StudentNameSnapshot, ClassName: lr.ClassNameSnapshot,
		GuardianName: strPtr(lr.GuardianNameSnapshot), HasEvidence: d.HasEvidence, HasLetter: d.HasLetter,
	}
}

func toAPILeaveSummary(i service.LeaveRequestItem) api.LeaveRequestSummary {
	return api.LeaveRequestSummary{
		InstanceId: i.InstanceID, StudentUserId: i.SubjectUserID, ClassId: uuidPtr(i.ClassID), Status: api.WorkflowStatus(i.Status),
		CurrentStageIndex: i.CurrentStageIndex, Category: api.LeaveCategory(i.Category), Reason: strPtr(i.Reason),
		StartsOn: openapi_types.Date{Time: i.StartsOn}, EndsOn: openapi_types.Date{Time: i.EndsOn}, LetterNumber: strPtr(i.LetterNumber),
		StudentName: i.StudentNameSnapshot, ClassName: i.ClassNameSnapshot, OpenedAt: i.OpenedAt,
	}
}

func toAPITemplate(t domain.Template) api.DocumentTemplate {
	vars := t.Variables
	return api.DocumentTemplate{
		Id: t.ID, Kind: string(t.Kind), Name: t.Name, Engine: string(t.Engine), Body: t.Body, Variables: &vars,
		IsDefault: t.IsDefault, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
	}
}
