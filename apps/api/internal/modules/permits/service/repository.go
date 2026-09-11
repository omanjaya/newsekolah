package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// Repository is permits' data-access boundary, implemented by repository/
// against sqlc-generated queries. Declaring it here (the consumer), not
// there, follows the same layering rule identity and school already use.
type Repository interface {
	// Workflow definitions.
	GetActiveDefinition(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (domain.Definition, bool, error)
	GetDefinitionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Definition, bool, error)
	ListDefinitions(ctx context.Context, tenantID uuid.UUID) ([]domain.Definition, error)
	LatestDefinitionVersion(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (int, error)
	DeactivateActiveDefinitions(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) error
	CreateDefinition(ctx context.Context, def domain.Definition) (domain.Definition, error)

	// Workflow instances.
	CreateInstance(ctx context.Context, inst domain.Instance) (domain.Instance, error)
	GetInstance(ctx context.Context, tenantID, id uuid.UUID) (domain.Instance, bool, error)
	GetInstanceForUpdate(ctx context.Context, tenantID, id uuid.UUID) (domain.Instance, bool, error)
	AdvanceInstance(ctx context.Context, tenantID, id uuid.UUID, stageIndex int, status domain.Status, closedAt *time.Time) (domain.Instance, error)
	GetInProgressInstance(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID uuid.UUID) (domain.Instance, bool, error)
	LockSubjectForInstanceCounting(ctx context.Context, tenantID, subjectUserID uuid.UUID) error
	CountInstancesForSubjectYear(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID, academicYearID uuid.UUID) (int64, error)
	CountInProgressInstances(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (int64, error)
	ListInstancesBySubject(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID uuid.UUID, limit, offset int) ([]domain.Instance, error)
	ExpireHangingInstances(ctx context.Context, tenantID uuid.UUID, openedBefore time.Time) ([]domain.Instance, error)
	HasInProgressLateArrivalOn(ctx context.Context, tenantID, subjectUserID uuid.UUID, date time.Time) (bool, error)
	MergeInstancePayload(ctx context.Context, tenantID, instanceID uuid.UUID, extra map[string]any) (domain.Instance, error)

	// Workflow events.
	CreateEvent(ctx context.Context, evt domain.Event) (domain.Event, error)
	ListEvents(ctx context.Context, tenantID, instanceID uuid.UUID) ([]domain.Event, error)
	GetEventByStage(ctx context.Context, tenantID, instanceID uuid.UUID, stageKey string) (domain.Event, bool, error)

	// Exit permits.
	CreateExitPermit(ctx context.Context, p domain.ExitPermit) (domain.ExitPermit, error)
	GetExitPermit(ctx context.Context, tenantID, instanceID uuid.UUID) (domain.ExitPermit, bool, error)
	MarkExitPermitIssued(ctx context.Context, tenantID, instanceID uuid.UUID, issuedAt time.Time) (domain.ExitPermit, error)
	SetExitPermitGateToken(ctx context.Context, tenantID, instanceID, gateTokenID uuid.UUID) (domain.ExitPermit, error)
	MarkExitPermitExited(ctx context.Context, tenantID, instanceID uuid.UUID, exitedAt time.Time, securityUserID uuid.UUID) (domain.ExitPermit, error)

	// Late arrivals.
	CreateLateArrival(ctx context.Context, l domain.LateArrival) (domain.LateArrival, error)
	GetLateArrival(ctx context.Context, tenantID, instanceID uuid.UUID) (domain.LateArrival, bool, error)
	UpdateLateArrivalReview(ctx context.Context, tenantID, instanceID uuid.UUID, reason string, action domain.RequiredAction, homeroomReported bool) (domain.LateArrival, error)
	MarkLateArrivalCompleted(ctx context.Context, tenantID, instanceID uuid.UUID, completedAt time.Time) (domain.LateArrival, error)
	ListLateArrivalsForReview(ctx context.Context, tenantID uuid.UUID) ([]LateArrivalReviewItem, error)

	// Leave requests.
	CreateLeaveRequest(ctx context.Context, r domain.LeaveRequest) (domain.LeaveRequest, error)
	GetLeaveRequest(ctx context.Context, tenantID, instanceID uuid.UUID) (domain.LeaveRequest, bool, error)
	GetIssuedLeaveCoveringDate(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (domain.LeaveRequest, bool, error)
	IssueLeaveRequest(ctx context.Context, tenantID, instanceID uuid.UUID, letterNumber string, issuedAt time.Time, issuedBy uuid.UUID) (domain.LeaveRequest, error)
	UpsertLeaveDocument(ctx context.Context, tenantID, leaveRequestID uuid.UUID, kind domain.DocumentKind, assetID, createdBy uuid.UUID) (LeaveDocumentInfo, error)
	GetLeaveDocument(ctx context.Context, tenantID, leaveRequestID uuid.UUID, kind domain.DocumentKind) (LeaveDocumentInfo, bool, error)
	ListLeaveRequestsBySubject(ctx context.Context, tenantID, subjectUserID uuid.UUID, limit, offset int) ([]LeaveRequestItem, error)
	ListLeaveRequestsForReview(ctx context.Context, tenantID, reviewerUserID uuid.UUID, classID uuid.NullUUID) ([]LeaveRequestItem, error)

	// Scan tokens.
	CreateScanToken(ctx context.Context, t domain.ScanToken) (domain.ScanToken, error)
	ConsumeScanToken(ctx context.Context, tenantID uuid.UUID, hash []byte, consumedBy uuid.UUID, now time.Time) (domain.ScanToken, bool, error)
	DeleteExpiredScanTokens(ctx context.Context, tenantID uuid.UUID, olderThan time.Time) (int64, error)
	GetScanTokenByHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.ScanToken, bool, error)

	// Documents.
	GetDefaultTemplate(ctx context.Context, tenantID uuid.UUID, kind domain.TemplateKind) (domain.Template, bool, error)
	GetTemplateByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Template, bool, error)
	ListTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.Template, error)
	CreateTemplate(ctx context.Context, t domain.Template) (domain.Template, error)
	UpdateTemplate(ctx context.Context, tenantID, id uuid.UUID, name, body string, variables []string) (domain.Template, error)
	SetDefaultTemplate(ctx context.Context, tenantID, id uuid.UUID, kind domain.TemplateKind) (domain.Template, error)
	NextSequenceValue(ctx context.Context, tenantID uuid.UUID, kind string, academicYearID uuid.UUID) (int64, error)
	CreateIssuedDocument(ctx context.Context, d domain.IssuedDocument) (domain.IssuedDocument, error)
	GetIssuedDocumentByVerificationHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.IssuedDocument, bool, error)
	GetIssuedDocumentByEntity(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, kind string) (domain.IssuedDocument, bool, error)

	// Cross-module reads (see queries/cross_module.sql): owned by
	// identity/academic, read-only here until a reader interface replaces
	// this after merge.
	GetActiveEnrollment(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (EnrollmentInfo, bool, error)
	GetClassName(ctx context.Context, tenantID, classID uuid.UUID) (string, error)
	GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
	GetStudentGuardianName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
	IsActiveTeacher(ctx context.Context, tenantID, userID uuid.UUID) (bool, error)
	HasActiveDuty(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, slug string, classID uuid.NullUUID) (bool, error)
	GetPeriod(ctx context.Context, tenantID, periodID uuid.UUID) (PeriodInfo, error)
	ListActiveTenants(ctx context.Context) ([]TenantInfo, error)

	// CreateAsset records an object permits itself put into storage
	// (evidence after re-encoding, a rendered letter) as an assets row,
	// so it can be referenced by leave_documents.asset_id /
	// issued_documents.asset_id and re-signed later.
	CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256Hex, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error)
	GetAssetObjectKey(ctx context.Context, tenantID, assetID uuid.UUID) (string, error)
}
