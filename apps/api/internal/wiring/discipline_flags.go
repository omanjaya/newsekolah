package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// DisciplineSessionViolations is attendance's ViolationRecorder with the
// discipline feature flag in front of it. Attendance is always on, so when
// a tenant has discipline turned off a save must still succeed without
// touching discipline: the call is skipped outright rather than forwarded
// with an empty list, because attendance always passes the session's full
// list and discipline replaces whatever was recorded before -- forwarding
// would delete the student's existing session violations.
type DisciplineSessionViolations struct {
	Recorder attendanceservice.ViolationRecorder
	Flags    ModuleFlagReader
}

func (d DisciplineSessionViolations) ReplaceSessionViolations(
	ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID, violationTypeIDs []uuid.UUID, occurredOn time.Time, reporterUserID uuid.UUID,
) error {
	on, err := moduleEnabled(ctx, d.Flags, tenantID, platformdomain.ModuleDiscipline)
	if err != nil {
		return err
	}
	if !on {
		return nil
	}
	return d.Recorder.ReplaceSessionViolations(ctx, tenantID, sessionID, studentUserID, violationTypeIDs, occurredOn, reporterUserID)
}
