package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
)

func (r *Repository) CreateTeachingAssignment(ctx context.Context, a domain.TeachingAssignment) (domain.TeachingAssignment, error) {
	row, err := r.queries(ctx).AcademicCreateTeachingAssignment(ctx, db.AcademicCreateTeachingAssignmentParams{
		TenantID: a.TenantID, AcademicYearID: a.AcademicYearID, TeacherUserID: a.TeacherUserID, SubjectID: a.SubjectID, ClassID: a.ClassID,
	})
	if err != nil {
		return domain.TeachingAssignment{}, err
	}
	return toTeachingAssignment(row), nil
}

func (r *Repository) GetTeachingAssignmentByID(ctx context.Context, tenantID, id uuid.UUID) (domain.TeachingAssignment, error) {
	row, err := r.queries(ctx).AcademicGetTeachingAssignmentByID(ctx, db.AcademicGetTeachingAssignmentByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.TeachingAssignment{}, err
	}
	return toTeachingAssignment(row), nil
}

func (r *Repository) UpdateTeachingAssignment(ctx context.Context, tenantID, id uuid.UUID, isActive bool) (domain.TeachingAssignment, error) {
	row, err := r.queries(ctx).AcademicUpdateTeachingAssignment(ctx, db.AcademicUpdateTeachingAssignmentParams{TenantID: tenantID, ID: id, IsActive: isActive})
	if err != nil {
		return domain.TeachingAssignment{}, err
	}
	return toTeachingAssignment(row), nil
}

func (r *Repository) DeleteTeachingAssignment(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteTeachingAssignment(ctx, db.AcademicDeleteTeachingAssignmentParams{TenantID: tenantID, ID: id})
}

func (r *Repository) DeleteTeachingAssignmentsForTeacherInYear(ctx context.Context, tenantID, yearID, teacherID uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteTeachingAssignmentsForTeacherInYear(ctx, db.AcademicDeleteTeachingAssignmentsForTeacherInYearParams{
		TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID,
	})
}

func (r *Repository) ListTeachingAssignments(ctx context.Context, tenantID, yearID uuid.UUID, teacherID, classID *uuid.UUID, page service.Page) ([]domain.TeachingAssignment, int64, error) {
	rows, err := r.queries(ctx).AcademicListTeachingAssignments(ctx, db.AcademicListTeachingAssignmentsParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: page.Limit, Offset: page.Offset,
		TeacherUserID: uuidPtrToPg(teacherID), ClassID: uuidPtrToPg(classID),
	})
	if err != nil {
		return nil, 0, err
	}
	assignments := make([]domain.TeachingAssignment, len(rows))
	var total int64
	for i, row := range rows {
		assignments[i] = toTeachingAssignment(row.TeachingAssignment)
		total = row.TotalCount
	}
	return assignments, total, nil
}

func (r *Repository) ListTeachingAssignmentsByTeacher(ctx context.Context, tenantID, yearID, teacherID uuid.UUID) ([]domain.TeachingAssignment, error) {
	rows, err := r.queries(ctx).AcademicListTeachingAssignmentsByTeacher(ctx, db.AcademicListTeachingAssignmentsByTeacherParams{
		TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID,
	})
	if err != nil {
		return nil, err
	}
	assignments := make([]domain.TeachingAssignment, len(rows))
	for i, row := range rows {
		assignments[i] = toTeachingAssignment(row)
	}
	return assignments, nil
}

func (r *Repository) TeacherHasAssignment(ctx context.Context, tenantID, yearID, teacherID, subjectID, classID uuid.UUID) (bool, error) {
	return r.queries(ctx).AcademicTeacherHasAssignment(ctx, db.AcademicTeacherHasAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID, SubjectID: subjectID, ClassID: classID,
	})
}

func toTeachingAssignment(row db.TeachingAssignment) domain.TeachingAssignment {
	return domain.TeachingAssignment{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID,
		TeacherUserID: row.TeacherUserID, SubjectID: row.SubjectID, ClassID: row.ClassID, IsActive: row.IsActive,
	}
}
