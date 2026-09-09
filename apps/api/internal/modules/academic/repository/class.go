package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateClass(ctx context.Context, c domain.Class) (domain.Class, error) {
	row, err := r.queries(ctx).AcademicCreateClass(ctx, db.AcademicCreateClassParams{
		TenantID: c.TenantID, AcademicYearID: c.AcademicYearID, GradeLevelID: c.GradeLevelID,
		TrackID: uuidPtrToPg(c.TrackID), Name: c.Name, RoomID: uuidPtrToPg(c.RoomID),
		Capacity: int32PtrToPg(c.Capacity), HomeroomTeacherID: uuidPtrToPg(c.HomeroomTeacherID),
	})
	if err != nil {
		return domain.Class{}, err
	}
	return toClass(row), nil
}

func (r *Repository) UpdateClass(ctx context.Context, c domain.Class) (domain.Class, error) {
	row, err := r.queries(ctx).AcademicUpdateClass(ctx, db.AcademicUpdateClassParams{
		TenantID: c.TenantID, ID: c.ID, GradeLevelID: c.GradeLevelID,
		TrackID: uuidPtrToPg(c.TrackID), Name: c.Name, RoomID: uuidPtrToPg(c.RoomID),
		Capacity: int32PtrToPg(c.Capacity), HomeroomTeacherID: uuidPtrToPg(c.HomeroomTeacherID),
	})
	if err != nil {
		return domain.Class{}, err
	}
	return toClass(row), nil
}

func (r *Repository) GetClassByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Class, error) {
	row, err := r.queries(ctx).AcademicGetClassByID(ctx, db.AcademicGetClassByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Class{}, err
	}
	return toClass(row), nil
}

func (r *Repository) ListClasses(ctx context.Context, tenantID, yearID uuid.UUID, search string, gradeLevelID *uuid.UUID, page service.Page) ([]domain.Class, int64, error) {
	rows, err := r.queries(ctx).AcademicListClasses(ctx, db.AcademicListClassesParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: page.Limit, Offset: page.Offset,
		Search: pdatabase.Text(search), GradeLevelID: uuidPtrToPg(gradeLevelID),
	})
	if err != nil {
		return nil, 0, err
	}
	classes := make([]domain.Class, len(rows))
	var total int64
	for i, row := range rows {
		classes[i] = toClass(row.Class)
		total = row.TotalCount
	}
	return classes, total, nil
}

func (r *Repository) ListClassesByYearAndGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]domain.Class, error) {
	rows, err := r.queries(ctx).AcademicListClassesByYearAndGradeLevel(ctx, db.AcademicListClassesByYearAndGradeLevelParams{
		TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID,
	})
	if err != nil {
		return nil, err
	}
	classes := make([]domain.Class, len(rows))
	for i, row := range rows {
		classes[i] = toClass(row)
	}
	return classes, nil
}

func (r *Repository) SoftDeleteClass(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicSoftDeleteClass(ctx, db.AcademicSoftDeleteClassParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountEnrollmentsForClass(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountEnrollmentsForClass(ctx, db.AcademicCountEnrollmentsForClassParams{TenantID: tenantID, ClassID: id})
}

func (r *Repository) CountTeachingAssignmentsForClass(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountTeachingAssignmentsForClass(ctx, db.AcademicCountTeachingAssignmentsForClassParams{TenantID: tenantID, ClassID: id})
}

func (r *Repository) CreateEnrollment(ctx context.Context, tenantID, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (domain.Enrollment, error) {
	row, err := r.queries(ctx).AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID, ClassID: classID, JoinedOn: pdatabase.Date(joinedOn),
	})
	if err != nil {
		return domain.Enrollment{}, err
	}
	return toEnrollment(row), nil
}

func (r *Repository) GetActiveEnrollment(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (domain.Enrollment, error) {
	row, err := r.queries(ctx).AcademicGetActiveEnrollment(ctx, db.AcademicGetActiveEnrollmentParams{
		TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID,
	})
	if err != nil {
		return domain.Enrollment{}, err
	}
	return toEnrollment(row), nil
}

func (r *Repository) GetEnrollmentByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Enrollment, error) {
	row, err := r.queries(ctx).AcademicGetEnrollmentByID(ctx, db.AcademicGetEnrollmentByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Enrollment{}, err
	}
	return toEnrollment(row), nil
}

func (r *Repository) CloseEnrollment(ctx context.Context, tenantID, id uuid.UUID, status string, leftOn time.Time) (domain.Enrollment, error) {
	row, err := r.queries(ctx).AcademicCloseEnrollment(ctx, db.AcademicCloseEnrollmentParams{
		TenantID: tenantID, ID: id, Status: status, LeftOn: pdatabase.Date(leftOn),
	})
	if err != nil {
		return domain.Enrollment{}, err
	}
	return toEnrollment(row), nil
}

func (r *Repository) ListEnrollmentsByClass(ctx context.Context, tenantID, classID uuid.UUID, page service.Page) ([]domain.Enrollment, int64, error) {
	rows, err := r.queries(ctx).AcademicListEnrollmentsByClass(ctx, db.AcademicListEnrollmentsByClassParams{
		TenantID: tenantID, ClassID: classID, Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		return nil, 0, err
	}
	enrollments := make([]domain.Enrollment, len(rows))
	var total int64
	for i, row := range rows {
		enrollments[i] = toEnrollment(row.Enrollment)
		total = row.TotalCount
	}
	return enrollments, total, nil
}

func (r *Repository) ListEnrollmentsByYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Enrollment, error) {
	rows, err := r.queries(ctx).AcademicListEnrollmentsByYear(ctx, db.AcademicListEnrollmentsByYearParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	enrollments := make([]domain.Enrollment, len(rows))
	for i, row := range rows {
		enrollments[i] = toEnrollment(row)
	}
	return enrollments, nil
}

func (r *Repository) ListEnrollmentsByYearAndGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]domain.Enrollment, error) {
	rows, err := r.queries(ctx).AcademicListEnrollmentsByYearAndGradeLevel(ctx, db.AcademicListEnrollmentsByYearAndGradeLevelParams{
		TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID,
	})
	if err != nil {
		return nil, err
	}
	enrollments := make([]domain.Enrollment, len(rows))
	for i, row := range rows {
		enrollments[i] = toEnrollment(row)
	}
	return enrollments, nil
}

func (r *Repository) ListPromotionCandidates(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.PromotionCandidate, error) {
	rows, err := r.queries(ctx).AcademicListPromotionCandidates(ctx, db.AcademicListPromotionCandidatesParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	candidates := make([]domain.PromotionCandidate, len(rows))
	for i, row := range rows {
		candidates[i] = domain.PromotionCandidate{
			StudentUserID: row.StudentUserID,
			EnrollmentID:  row.EnrollmentID,
			FromClassID:   row.FromClassID,
			GradeLevelID:  row.GradeLevelID,
			GradeSequence: row.GradeSequence,
			TrackID:       pgToUUIDPtr(row.TrackID),
		}
	}
	return candidates, nil
}

func (r *Repository) ListClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.TargetClass, error) {
	rows, err := r.queries(ctx).AcademicListClassesForYear(ctx, db.AcademicListClassesForYearParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	targets := make([]domain.TargetClass, len(rows))
	for i, row := range rows {
		targets[i] = domain.TargetClass{ClassID: row.ID, GradeLevelID: row.GradeLevelID, TrackID: pgToUUIDPtr(row.TrackID)}
	}
	return targets, nil
}

// ListAllClassesForYear returns every class in yearID, unpaginated -- the
// new-academic-year setup's copy-forward step needs the whole list, not a
// page of it.
func (r *Repository) ListAllClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Class, error) {
	rows, err := r.queries(ctx).AcademicListAllClassesForYear(ctx, db.AcademicListAllClassesForYearParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	classes := make([]domain.Class, len(rows))
	for i, row := range rows {
		classes[i] = toClass(row)
	}
	return classes, nil
}

func toClass(row db.Class) domain.Class {
	return domain.Class{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, GradeLevelID: row.GradeLevelID,
		TrackID: pgToUUIDPtr(row.TrackID), Name: row.Name, RoomID: pgToUUIDPtr(row.RoomID),
		Capacity: pgToInt32Ptr(row.Capacity), HomeroomTeacherID: pgToUUIDPtr(row.HomeroomTeacherID),
	}
}

func toEnrollment(row db.Enrollment) domain.Enrollment {
	return domain.Enrollment{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID,
		ClassID: row.ClassID, Status: row.Status, JoinedOn: pdatabase.DateOrZero(row.JoinedOn), LeftOn: dateToTimePtr(row.LeftOn),
	}
}
