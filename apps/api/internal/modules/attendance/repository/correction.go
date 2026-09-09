package repository

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

func (r *Repository) CreateCorrection(ctx context.Context, c domain.Correction) (domain.Correction, error) {
	row, err := r.queries(ctx).CreateAttendanceCorrection(ctx, db.CreateAttendanceCorrectionParams{
		TenantID: c.TenantID, EntryID: c.EntryID, OldStatus: c.OldStatus, NewStatus: c.NewStatus,
		Reason: c.Reason, CorrectedBy: c.CorrectedBy,
	})
	if err != nil {
		return domain.Correction{}, err
	}
	return toCorrection(row), nil
}
