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

// EndActiveHomeroomAssignments ends every active homeroom assignment of
// classID as of endsOn.
func (r *Repository) EndActiveHomeroomAssignments(ctx context.Context, tenantID, yearID, dutyTypeID, classID uuid.UUID, endsOn time.Time) error {
	return r.queries(ctx).AcademicEndActiveHomeroomAssignments(ctx, db.AcademicEndActiveHomeroomAssignmentsParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyTypeID, ScopeClassID: uuidPtrToPg(&classID),
		EndsOn: pdatabase.Date(endsOn),
	})
}

// TeacherIsHomeroomOfOtherClass reports whether teacherID already holds the
// homeroom duty for a class other than classID this year.
func (r *Repository) TeacherIsHomeroomOfOtherClass(ctx context.Context, tenantID, yearID, dutyTypeID, teacherID, classID uuid.UUID) (bool, error) {
	return r.queries(ctx).AcademicTeacherIsHomeroomOfOtherClass(ctx, db.AcademicTeacherIsHomeroomOfOtherClassParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyTypeID, UserID: teacherID, ClassID: classID,
	})
}

func (r *Repository) CreateHomeroomAssignment(ctx context.Context, tenantID, yearID, dutyTypeID, teacherID, classID uuid.UUID, startsOn time.Time) error {
	return r.queries(ctx).AcademicCreateHomeroomAssignment(ctx, db.AcademicCreateHomeroomAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyTypeID, UserID: teacherID,
		ScopeClassID: uuidPtrToPg(&classID), StartsOn: pdatabase.Date(startsOn),
	})
}

// GetTenantTimezone returns the tenant's configured IANA timezone ("" when
// unset).
func (r *Repository) GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error) {
	return r.queries(ctx).AcademicGetTenantTimezone(ctx, tenantID)
}
