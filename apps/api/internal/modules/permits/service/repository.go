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
	ListLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) ([]LateArrivalReviewItem, error)

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
	UpdateTemplate(ctx context.Context, tenantID, id uuid.UUID, name, body string, variables []string, letterheadAssetID uuid.NullUUID) (domain.Template, error)
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
	// GetTenantTimezone is the IANA name permits itself must compute
	// wall-clock instants in (gate-token expiry, forced attendance
	// windows, teacher_of_class_now) -- see tenantLocation.
	GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error)
	// HasPermission is the union authz.EffectivePermissions computes for
	// the HTTP layer (role-granted or duty-granted), reused by the
	// service-level ownership checks permits itself must make on detail
	// endpoints (RequireCanViewLeaveRequest and its exit-permit/
	// late-arrival counterparts).
	HasPermission(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, permissionCode string) (bool, error)
	// HasRolePermission is HasPermission narrowed to a directly assigned
	// role, excluding duty-granted permissions -- the distinction the
	// late-arrival review "admins as fallback" rule needs (see
	// ReviewLateArrival).
	HasRolePermission(ctx context.Context, tenantID, userID uuid.UUID, permissionCode string) (bool, error)
	// IsStudentProfile backs the classroom-entry rule that a token may
	// only be consumed by a student.
	IsStudentProfile(ctx context.Context, tenantID, userID uuid.UUID) (bool, error)
	// GetStudentNISAndAddress backs the leave-letter template's {{nis}}
	// and {{address}} placeholders.
	GetStudentNISAndAddress(ctx context.Context, tenantID, studentUserID uuid.UUID) (nis, address string, err error)
	// GetExitPermitInstanceForSubjectToday backs the "one exit permit per
	// day regardless of status" rule with a friendly domain error instead
	// of a raw unique-violation from ux_workflow_instances_one_exit_permit_per_day.
	GetExitPermitInstanceForSubjectToday(ctx context.Context, tenantID, studentUserID uuid.UUID) (domain.Instance, bool, error)
	// ListExitPermitsForApproval is the counselor/leadership/security
	// queue: in-progress permits at a duty-scoped approval stage, plus
	// every approved permit visible to scan_exit_permits holders.
	ListExitPermitsForApproval(ctx context.Context, tenantID, callerUserID uuid.UUID) ([]ExitPermitReviewItem, error)
	// ListExitPermitsForYear backs the counselor's yearly exit-permit
	// report: every permit opened within academicYearID's own calendar
	// bounds, regardless of status.
	ListExitPermitsForYear(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]ExitPermitReportRow, error)
	// GetLatestPolicy/CreatePolicy read and seed tenant_policies rows for
	// permits' own kinds ("permits", "late_arrival_actions"), mirroring
	// attendance/service.Repository's identically-named pair.
	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) (config []byte, version int, found bool, err error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	// CreateAsset records an object permits itself put into storage
	// (evidence after re-encoding, a rendered letter) as an assets row,
	// so it can be referenced by leave_documents.asset_id /
	// issued_documents.asset_id and re-signed later.
	CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256Hex, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error)
	GetAssetObjectKey(ctx context.Context, tenantID, assetID uuid.UUID) (string, error)
}
