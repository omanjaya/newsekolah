package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
)

// ListStudentNISNs implements service.DapodikReader: every non-blank NISN
// this tenant has on file, mapped to the account it belongs to. The
// Dapodik import service uses this to match uploaded rows against existing
// students in one round trip instead of one query per row.
func (r *Repository) ListStudentNISNs(ctx context.Context, tenantID uuid.UUID) (map[string]uuid.UUID, error) {
	rows, err := r.queries(ctx).ListStudentNISNs(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list student nisns: %w", err)
	}
	out := make(map[string]uuid.UUID, len(rows))
	for _, row := range rows {
		out[row.Nisn.String] = row.UserID
	}
	return out, nil
}

// RecordDapodikImportBatch logs one commit of the Dapodik import so an
// admin can see when the roster was last synced and what it did.
func (r *Repository) RecordDapodikImportBatch(ctx context.Context, tenantID uuid.UUID, rowCount, createdCount, updatedCount, errorCount int, createdBy uuid.UUID) error {
	// Counts come from len() over one uploaded CSV, never a user-controlled
	// integer, so overflowing a signed 32-bit column is not reachable.
	_, err := r.queries(ctx).CreateDapodikImportBatch(ctx, db.CreateDapodikImportBatchParams{
		TenantID:     tenantID,
		RowCount:     int32(rowCount),     // #nosec G115 -- row count from len(), not user input
		CreatedCount: int32(createdCount), // #nosec G115 -- same
		UpdatedCount: int32(updatedCount), // #nosec G115 -- same
		ErrorCount:   int32(errorCount),   // #nosec G115 -- same
		CreatedBy:    createdBy,
	})
	if err != nil {
		return fmt.Errorf("record dapodik import batch: %w", err)
	}
	return nil
}
