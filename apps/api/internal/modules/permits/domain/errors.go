package domain

import "errors"

var (
	ErrDefinitionNotFound    = errors.New("workflow definition not found")
	ErrDefinitionInvalid     = errors.New("workflow definition is invalid")
	ErrInstanceNotFound      = errors.New("workflow instance not found")
	ErrInstanceNotInProgress = errors.New("workflow instance is not in progress")
	ErrStageIndexOutOfRange  = errors.New("stage index out of range")
	ErrApproverNotEligible   = errors.New("actor does not satisfy the stage approver rule")
	ErrApproverNotDistinct   = errors.New("actor already approved an earlier stage this rule requires to be distinct")
	ErrAlreadyInProgress     = errors.New("subject already has an in-progress workflow of this kind today")
	ErrNotWorkflowSubject    = errors.New("only the workflow's own subject may perform this action")
	ErrAcademicYearRequired  = errors.New("tenant has no active academic year")
	ErrEnrollmentNotFound    = errors.New("student has no active enrollment")
	ErrPeriodRangeInvalid    = errors.New("end period must be after start period")

	ErrTokenNotFound        = errors.New("scan token not found")
	ErrTokenExpired         = errors.New("scan token expired")
	ErrTokenConsumed        = errors.New("scan token already consumed")
	ErrTokenPurposeMismatch = errors.New("scan token purpose does not match this operation")
	ErrTokenContextMismatch = errors.New("scan token context does not match this operation")

	ErrExitPermitNotIssued = errors.New("exit permit has not been issued yet")
	ErrExitPermitExited    = errors.New("exit permit already exited")

	ErrLeaveRequestDateRangeInvalid = errors.New("leave request end date must not be before start date")
	ErrLeaveRequestNotReviewable    = errors.New("leave request is not awaiting review")
	ErrLeaveRequestNotIssuable      = errors.New("leave request is not awaiting issuance")
	ErrLeaveRejectionReasonRequired = errors.New("rejecting a leave request requires a reason")
	ErrEvidenceTooLarge             = errors.New("evidence file exceeds the size limit")
	ErrEvidenceInvalidType          = errors.New("evidence file is not a supported image type")

	ErrTemplateNotFound = errors.New("document template not found")
	ErrDocumentNotFound = errors.New("issued document not found")
	ErrDocumentRevoked  = errors.New("issued document has been revoked")
)
