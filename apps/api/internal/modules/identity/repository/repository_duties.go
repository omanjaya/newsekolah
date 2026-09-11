package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toDutyTypeRecord(row db.DutyType) service.DutyTypeRecord {
	return service.DutyTypeRecord{
		ID: row.ID, Slug: row.Slug, Name: row.Name, ScopeKind: domain.DutyScopeKind(row.ScopeKind), IsActive: row.IsActive,
	}
}

func (r *Repository) ListDutyTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]service.DutyTypeRecord, error) {
	rows, err := r.queries(ctx).ListDutyTypes(ctx, db.ListDutyTypesParams{TenantID: tenantID, IncludeInactive: includeInactive})
	if err != nil {
		return nil, fmt.Errorf("list duty types: %w", err)
	}
	out := make([]service.DutyTypeRecord, len(rows))
	for i, row := range rows {
		out[i] = toDutyTypeRecord(row)
	}
	return out, nil
}

func (r *Repository) GetDutyTypeByID(ctx context.Context, tenantID, id uuid.UUID) (service.DutyTypeRecord, error) {
	row, err := r.queries(ctx).GetDutyTypeByID(ctx, db.GetDutyTypeByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return service.DutyTypeRecord{}, fmt.Errorf("get duty type: %w", err)
	}
	return toDutyTypeRecord(row), nil
}

func (r *Repository) CreateDutyTypeRecord(ctx context.Context, tenantID uuid.UUID, slug, name string, scope domain.DutyScopeKind) (service.DutyTypeRecord, error) {
	row, err := r.queries(ctx).CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: tenantID, Slug: slug, Name: name, ScopeKind: string(scope),
	})
	if err != nil {
		return service.DutyTypeRecord{}, fmt.Errorf("create duty type: %w", err)
	}
	return toDutyTypeRecord(row), nil
}

// GetDutyTypeBySlug is the lookup tenant bootstrap uses to seed the
// default duty types idempotently: re-running it on a tenant that already
// has "homeroom" must not error or duplicate the row.
func (r *Repository) GetDutyTypeBySlug(ctx context.Context, tenantID uuid.UUID, slug string) (service.DutyTypeRecord, bool, error) {
	row, err := r.queries(ctx).GetDutyTypeBySlug(ctx, db.GetDutyTypeBySlugParams{TenantID: tenantID, Slug: slug})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.DutyTypeRecord{}, false, nil
		}
		return service.DutyTypeRecord{}, false, fmt.Errorf("get duty type by slug: %w", err)
	}
	return toDutyTypeRecord(row), true, nil
}

func (r *Repository) UpdateDutyTypeRecord(ctx context.Context, tenantID, id uuid.UUID, name string, scope domain.DutyScopeKind, isActive bool) error {
	err := r.queries(ctx).UpdateDutyType(ctx, db.UpdateDutyTypeParams{
		TenantID: tenantID, ID: id, Name: name, ScopeKind: string(scope), IsActive: isActive,
	})
	if err != nil {
		return fmt.Errorf("update duty type: %w", err)
	}
	return nil
}

func (r *Repository) SoftDeleteDutyType(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).SoftDeleteDutyType(ctx, db.SoftDeleteDutyTypeParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountAssignmentsForDutyType(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).CountAssignmentsForDutyType(ctx, db.CountAssignmentsForDutyTypeParams{TenantID: tenantID, DutyTypeID: id})
}

func (r *Repository) DeleteDutyPermissions(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).DeleteDutyPermissions(ctx, db.DeleteDutyPermissionsParams{TenantID: tenantID, DutyTypeID: id})
}

func (r *Repository) AddDutyPermissionRecord(ctx context.Context, tenantID, id uuid.UUID, code string) error {
	return r.queries(ctx).AddDutyPermission(ctx, db.AddDutyPermissionParams{DutyTypeID: id, PermissionCode: code, TenantID: tenantID})
}

func (r *Repository) ListDutyPermissionCodes(ctx context.Context, tenantID, id uuid.UUID) ([]string, error) {
	return r.queries(ctx).ListDutyPermissionCodes(ctx, db.ListDutyPermissionCodesParams{TenantID: tenantID, DutyTypeID: id})
}

func toDutyAssignmentRecord(id, academicYearID, dutyTypeID, userID uuid.UUID, dutySlug, dutyName string, scopeClassID, scopeStudentID uuid.NullUUID, isActive bool, startsOn time.Time, endsOn *time.Time) service.DutyAssignmentRecord {
	return service.DutyAssignmentRecord{
		ID: id, AcademicYearID: academicYearID, DutyTypeID: dutyTypeID, DutySlug: dutySlug, DutyName: dutyName,
		UserID: userID, ScopeClassID: scopeClassID, ScopeStudentID: scopeStudentID, IsActive: isActive,
		StartsOn: startsOn, EndsOn: endsOn,
	}
}

func (r *Repository) ListDutyAssignments(ctx context.Context, tenantID, academicYearID uuid.UUID, dutyTypeID, userID uuid.NullUUID) ([]service.DutyAssignmentRecord, error) {
	rows, err := r.queries(ctx).ListDutyAssignmentsAdmin(ctx, db.ListDutyAssignmentsAdminParams{
		TenantID: tenantID, AcademicYearID: academicYearID,
		DutyTypeID: pdatabase.NullUUID(dutyTypeID), UserID: pdatabase.NullUUID(userID),
	})
	if err != nil {
		return nil, fmt.Errorf("list duty assignments: %w", err)
	}
	out := make([]service.DutyAssignmentRecord, len(rows))
	for i, row := range rows {
		out[i] = toDutyAssignmentRecord(
			row.ID, row.AcademicYearID, row.DutyTypeID, row.UserID, row.DutySlug, row.DutyName,
			pdatabase.UUIDOrNil(row.ScopeClassID), pdatabase.UUIDOrNil(row.ScopeStudentID),
			row.IsActive, pdatabase.DateOrZero(row.StartsOn), endsOnPtr(row.EndsOn),
		)
	}
	return out, nil
}

func (r *Repository) GetDutyAssignmentByID(ctx context.Context, tenantID, id uuid.UUID) (service.DutyAssignmentRecord, error) {
	row, err := r.queries(ctx).GetDutyAssignmentByID(ctx, db.GetDutyAssignmentByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return service.DutyAssignmentRecord{}, fmt.Errorf("get duty assignment: %w", err)
	}
	dutyType, err := r.queries(ctx).GetDutyTypeByID(ctx, db.GetDutyTypeByIDParams{TenantID: tenantID, ID: row.DutyTypeID})
	if err != nil {
		return service.DutyAssignmentRecord{}, fmt.Errorf("get duty type for assignment: %w", err)
	}
	return toDutyAssignmentRecord(
		row.ID, row.AcademicYearID, row.DutyTypeID, row.UserID, dutyType.Slug, dutyType.Name,
		pdatabase.UUIDOrNil(row.ScopeClassID), pdatabase.UUIDOrNil(row.ScopeStudentID),
		row.IsActive, pdatabase.DateOrZero(row.StartsOn), endsOnPtr(row.EndsOn),
	), nil
}

func (r *Repository) CreateDutyAssignmentRecord(ctx context.Context, tenantID uuid.UUID, in service.DutyAssignmentRecord) (service.DutyAssignmentRecord, error) {
	row, err := r.queries(ctx).CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: tenantID, AcademicYearID: in.AcademicYearID, DutyTypeID: in.DutyTypeID, UserID: in.UserID,
		ScopeClassID: pdatabase.NullUUID(in.ScopeClassID), ScopeStudentID: pdatabase.NullUUID(in.ScopeStudentID),
		StartsOn: pdatabase.Date(in.StartsOn),
	})
	if err != nil {
		return service.DutyAssignmentRecord{}, fmt.Errorf("create duty assignment: %w", err)
	}
	return toDutyAssignmentRecord(
		row.ID, row.AcademicYearID, row.DutyTypeID, row.UserID, in.DutySlug, in.DutyName,
		pdatabase.UUIDOrNil(row.ScopeClassID), pdatabase.UUIDOrNil(row.ScopeStudentID),
		row.IsActive, pdatabase.DateOrZero(row.StartsOn), endsOnPtr(row.EndsOn),
	), nil
}

func (r *Repository) UpdateDutyAssignmentRecord(ctx context.Context, tenantID, id uuid.UUID, isActive bool, endsOn *time.Time) error {
	var ends time.Time
	if endsOn != nil {
		ends = *endsOn
	}
	err := r.queries(ctx).UpdateDutyAssignment(ctx, db.UpdateDutyAssignmentParams{
		TenantID: tenantID, ID: id, IsActive: isActive, EndsOn: pdatabase.Date(ends),
	})
	if err != nil {
		return fmt.Errorf("update duty assignment: %w", err)
	}
	return nil
}

func (r *Repository) DeleteDutyAssignmentRecord(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).DeleteDutyAssignment(ctx, db.DeleteDutyAssignmentParams{TenantID: tenantID, ID: id})
}

func (r *Repository) ClassExists(ctx context.Context, tenantID, classID uuid.UUID) (bool, error) {
	return r.queries(ctx).ClassExistsInTenant(ctx, db.ClassExistsInTenantParams{TenantID: tenantID, ID: classID})
}

func (r *Repository) ClassExistsInYear(ctx context.Context, tenantID, classID, academicYearID uuid.UUID) (bool, error) {
	return r.queries(ctx).ClassExistsInYear(ctx, db.ClassExistsInYearParams{TenantID: tenantID, ID: classID, AcademicYearID: academicYearID})
}

func (r *Repository) UserExists(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).UserExistsInTenant(ctx, db.UserExistsInTenantParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) IsActiveTeacherOrStaff(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).IsActiveTeacherOrStaff(ctx, db.IsActiveTeacherOrStaffParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) ListStaffOptions(ctx context.Context, tenantID uuid.UUID, search string, limit int32) ([]service.UserOption, error) {
	rows, err := r.queries(ctx).ListStaffOptions(ctx, db.ListStaffOptionsParams{TenantID: tenantID, Search: pdatabase.Text(search), Limit: limit})
	if err != nil {
		return nil, err
	}
	out := make([]service.UserOption, len(rows))
	for i, row := range rows {
		out[i] = service.UserOption{ID: row.ID, Name: row.Name}
	}
	return out, nil
}

// UpdateClassHomeroomTeacher writes classes.homeroom_teacher_id directly
// (a cross-module write onto a table academic owns, mirroring the
// cross-module reads scoping/teaching already do against each other's
// tables) -- pass an invalid teacherID to clear it. See the query's
// comment for why this column is kept in sync at all.
func (r *Repository) UpdateClassHomeroomTeacher(ctx context.Context, tenantID, classID uuid.UUID, teacherID uuid.NullUUID) error {
	return r.queries(ctx).UpdateClassHomeroomTeacher(ctx, db.UpdateClassHomeroomTeacherParams{
		TenantID: tenantID, ID: classID, HomeroomTeacherID: pdatabase.NullUUID(teacherID),
	})
}

func endsOnPtr(d pgtype.Date) *time.Time {
	if !d.Valid {
		return nil
	}
	t := d.Time
	return &t
}
