package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// FindHomeroomDutyTypeID looks up the tenant's "homeroom" duty type,
// found=false when the tenant has not been seeded with it yet (an older
// tenant from before bootstrap started seeding duty types) -- callers
// treat that as "nothing to sync", not an error.
func (r *Repository) FindHomeroomDutyTypeID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error) {
	id, err := r.queries(ctx).AcademicFindHomeroomDutyTypeID(ctx, tenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.UUID{}, false, nil
		}
		return uuid.UUID{}, false, err
	}
	return id, true, nil
}

// FindActiveHomeroomAssignment returns the class's current active
// homeroom duty assignment, if any.
func (r *Repository) FindActiveHomeroomAssignment(ctx context.Context, tenantID, yearID, dutyTypeID, classID uuid.UUID) (id, userID uuid.UUID, found bool, err error) {
	row, err := r.queries(ctx).AcademicFindActiveHomeroomAssignment(ctx, db.AcademicFindActiveHomeroomAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyTypeID, ScopeClassID: uuidPtrToPg(&classID),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.UUID{}, uuid.UUID{}, false, nil
		}
		return uuid.UUID{}, uuid.UUID{}, false, err
	}
	return row.ID, row.UserID, true, nil
}

func (r *Repository) EndHomeroomAssignment(ctx context.Context, tenantID, id uuid.UUID, endsOn time.Time) error {
	return r.queries(ctx).AcademicEndHomeroomAssignment(ctx, db.AcademicEndHomeroomAssignmentParams{
		TenantID: tenantID, ID: id, EndsOn: pdatabase.Date(endsOn),
	})
}

func (r *Repository) CreateHomeroomAssignment(ctx context.Context, tenantID, yearID, dutyTypeID, teacherID, classID uuid.UUID, startsOn time.Time) error {
	return r.queries(ctx).AcademicCreateHomeroomAssignment(ctx, db.AcademicCreateHomeroomAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyTypeID, UserID: teacherID,
		ScopeClassID: uuidPtrToPg(&classID), StartsOn: pdatabase.Date(startsOn),
	})
}
