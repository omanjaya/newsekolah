package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
)

// ListActiveEnrollments reads the active enrollments for a year directly
// from academic's tables (docs/03-layered-architecture.md: a read across
// modules is fine via the caller's own sqlc query; only writes to another
// module's tables are forbidden).
func (r *Repository) ListActiveEnrollments(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.StudentEnrollment, error) {
	rows, err := r.queries(ctx).BillingActiveEnrollments(ctx, db.BillingActiveEnrollmentsParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, fmt.Errorf("list active enrollments: %w", err)
	}
	out := make([]domain.StudentEnrollment, len(rows))
	for i, row := range rows {
		out[i] = domain.StudentEnrollment{StudentUserID: row.StudentUserID, ClassID: uuid.NullUUID{UUID: row.ClassID, Valid: true}}
	}
	return out, nil
}

func (r *Repository) StudentDisplay(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (service.StudentDisplay, error) {
	row, err := r.queries(ctx).BillingStudentDisplay(ctx, db.BillingStudentDisplayParams{TenantID: tenantID, ID: studentID, AcademicYearID: yearID})
	if err != nil {
		return service.StudentDisplay{}, fmt.Errorf("student display: %w", err)
	}
	return service.StudentDisplay{StudentName: row.StudentName, ClassName: row.ClassName, GuardianName: row.GuardianName}, nil
}
