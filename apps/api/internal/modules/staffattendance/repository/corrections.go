package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

func (r *Repository) CreateCorrection(
	ctx context.Context, tenantID, recordID, changedBy uuid.UUID, reason string, previous, next domain.Snapshot,
) error {
	previousJSON, err := json.Marshal(previous)
	if err != nil {
		return fmt.Errorf("marshal previous snapshot: %w", err)
	}
	nextJSON, err := json.Marshal(next)
	if err != nil {
		return fmt.Errorf("marshal new snapshot: %w", err)
	}
	_, err = r.queries(ctx).CreateStaffAttendanceCorrection(ctx, db.CreateStaffAttendanceCorrectionParams{
		TenantID: tenantID, RecordID: recordID, Reason: reason,
		PreviousSnapshot: previousJSON, NewSnapshot: nextJSON, CreatedBy: changedBy,
	})
	if err != nil {
		return fmt.Errorf("create staff attendance correction: %w", err)
	}
	return nil
}
