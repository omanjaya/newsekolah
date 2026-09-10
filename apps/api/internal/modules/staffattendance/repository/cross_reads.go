package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
)

// IsFeatureEnabled reads the shared feature_flags table directly: a
// tenant with no row for this module is enabled by default, matching
// platform/service.ListFlags's "opt-out" semantics (see
// docs/03-layered-architecture.md section 5).
func (r *Repository) IsFeatureEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	enabled, err := r.queries(ctx).StaffAttendanceGetFeatureFlag(ctx, db.StaffAttendanceGetFeatureFlagParams{
		TenantID: tenantID, Module: module,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return true, nil
		}
		return false, err
	}
	return enabled, nil
}
