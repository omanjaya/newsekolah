package service

import (
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// EnrollmentInfo is the slice of a student's active enrollment permits
// needs: which class, its display name, and (for the homeroom_of_student
// approver rule and class-name snapshots) who teaches it.
type EnrollmentInfo struct {
	ClassID           uuid.UUID
	ClassName         string
	HomeroomTeacherID uuid.NullUUID
}

// PeriodInfo is the slice of a periods row permits needs to validate an
// exit permit's period range and compute a gate token's expiry.
type PeriodInfo struct {
	ID         uuid.UUID
	TemplateID uuid.UUID
	Name       string
	Sequence   int
	// StartsAt/EndsAt are wall-clock times of day (no date component);
	// the caller combines them with a calendar date and the tenant's
	// timezone to get an absolute instant.
	StartsAt time.Duration
	EndsAt   time.Duration
}

// TenantInfo is what the platform-wide expiry and token-cleanup jobs need
// per tenant: enough to run one tenant-scoped transaction and convert
// "midnight" to that tenant's actual timezone.
type TenantInfo struct {
	ID       uuid.UUID
	Timezone string
}

// LeaveDocumentInfo is one leave_documents row.
type LeaveDocumentInfo struct {
	ID        uuid.UUID
	Kind      string
	AssetID   uuid.UUID
	CreatedAt time.Time
}

// LateArrivalReviewItem is an open late arrival joined with its workflow
// state. CurrentStage tells a queue what the caller does next: a manual
// stage is reviewed with the form, a qr_scan stage is approved by showing
// the student a stage QR.
type LateArrivalReviewItem struct {
	domain.LateArrival
	SubjectUserID     uuid.UUID
	ClassID           uuid.NullUUID
	AcademicYearID    uuid.UUID
	CurrentStageIndex int
	CurrentStage      domain.Stage
	Status            domain.Status
	OpenedAt          time.Time
	// ClassName is the class the flow was opened in, read live (a late
	// arrival keeps no snapshot); empty when the class is gone.
	ClassName string
}

// instance is the slice of the workflow instance the approver rules read
// (evaluateApproverRule), rebuilt from the queue row so narrowing a queue
// does not reload every instance.
func (i LateArrivalReviewItem) instance() domain.Instance {
	return domain.Instance{
		ID: i.InstanceID, TenantID: i.TenantID, AcademicYearID: i.AcademicYearID, Kind: domain.KindLateArrival,
		SubjectUserID: i.SubjectUserID, ClassID: i.ClassID, CurrentStageIndex: i.CurrentStageIndex, Status: i.Status,
	}
}

// ExitPermitReportRow is one exit_permits row for the counselor's yearly
// report (docs/analysis/backend-inventory.md 1.15), spanning the whole
// active academic year.
type ExitPermitReportRow struct {
	domain.ExitPermit
	Status   domain.Status
	OpenedAt time.Time
	ClosedAt *time.Time
}

// ExitPermitReviewItem is an exit permit joined with its workflow state,
// for the counselor/leadership/security approval queue.
type ExitPermitReviewItem struct {
	domain.ExitPermit
	SubjectUserID     uuid.UUID
	ClassID           uuid.NullUUID
	CurrentStageIndex int
	// CurrentStage is the stage the permit waits at, so an approver's
	// sheet can name it; nil once every stage has passed.
	CurrentStage *domain.Stage
	Status       domain.Status
	OpenedAt     time.Time
}

// ExitPermitAwaitingReturn is a permit whose student went through the gate
// and has not been recorded back, for the gate's list.
type ExitPermitAwaitingReturn struct {
	domain.ExitPermit
	SubjectUserID uuid.UUID
	ClassID       uuid.NullUUID
	// Unrecorded is a permit from an earlier day: its exit day ended with
	// no return on record, and the return can no longer be recorded.
	Unrecorded bool
}

// LeaveRequestItem is a leave request joined with its workflow state.
type LeaveRequestItem struct {
	domain.LeaveRequest
	SubjectUserID  uuid.UUID
	ClassID        uuid.NullUUID
	AcademicYearID uuid.UUID
	// SchoolDays is how many days of the range the class has lessons on
	// (countSchoolDays), the leave's real length.
	SchoolDays        int
	Status            domain.Status
	OpenedAt          time.Time
	CurrentStageIndex int
	// AwaitingLetter is set by the review queue only: the request is at its
	// final stage, which issuing the letter completes (not a review).
	AwaitingLetter *bool
}
