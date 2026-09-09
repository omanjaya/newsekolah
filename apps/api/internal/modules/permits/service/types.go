package service

import (
	"time"

	"github.com/google/uuid"
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
