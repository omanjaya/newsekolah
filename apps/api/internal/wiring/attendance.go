package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	attendancedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
)

// PermitsOverrider exposes permits' issued leave letters to attendance as
// its Overrider: a letter covering a date forces the student's status for
// it. It also implements attendance's BatchOverrider so tenant-level jobs
// resolve many students and dates in one query.
type PermitsOverrider struct{ Svc *permitsservice.Service }

func (o PermitsOverrider) Override(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (string, attendancedomain.EntrySource, bool, error) {
	status, ok, err := o.Svc.LeaveOverride(ctx, tenantID, studentUserID, date)
	if err != nil || !ok {
		return "", "", false, err
	}
	return status, attendancedomain.SourceLeave, true, nil
}

func (o PermitsOverrider) OverridesForDates(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]attendanceservice.DateOverride, error) {
	rows, err := o.Svc.LeaveOverridesForDates(ctx, tenantID, studentIDs, dates)
	if err != nil {
		return nil, err
	}
	out := make([]attendanceservice.DateOverride, len(rows))
	for i, r := range rows {
		out[i] = attendanceservice.DateOverride{StudentUserID: r.StudentUserID, Date: r.Date, StatusCode: r.StatusCode}
	}
	return out, nil
}
