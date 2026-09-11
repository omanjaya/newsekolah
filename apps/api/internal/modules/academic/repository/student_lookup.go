package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) FindStudentByUsername(ctx context.Context, tenantID uuid.UUID, username string) (service.StudentSummary, error) {
	row, err := r.queries(ctx).AcademicFindStudentByUsername(ctx, db.AcademicFindStudentByUsernameParams{TenantID: tenantID, Username: username})
	if err != nil {
		return service.StudentSummary{}, err
	}
	return service.StudentSummary{ID: row.ID, Name: row.Name, Username: row.Username}, nil
}

// IsActiveStudent reports whether userID is an active user with a student
// profile -- the check enrollment mutations run before opening or moving an
// enrollment, so a mistyped or non-student id fails with a clear 400
// instead of silently creating an enrollment for the wrong kind of user.
func (r *Repository) IsActiveStudent(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).AcademicIsActiveStudent(ctx, db.AcademicIsActiveStudentParams{TenantID: tenantID, ID: userID})
}

// IsActiveTeacher reports whether userID is an active user with a teacher
// profile -- teaching assignments check this the same way enrollments
// check IsActiveStudent, mirroring the old app's role+status guard.
func (r *Repository) IsActiveTeacher(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).AcademicIsActiveTeacher(ctx, db.AcademicIsActiveTeacherParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) FindStudentByNIS(ctx context.Context, tenantID uuid.UUID, nis string) (service.StudentSummary, error) {
	row, err := r.queries(ctx).AcademicFindStudentByNIS(ctx, db.AcademicFindStudentByNISParams{TenantID: tenantID, Nis: pdatabase.Text(nis)})
	if err != nil {
		return service.StudentSummary{}, err
	}
	return service.StudentSummary{ID: row.ID, Name: row.Name, Username: row.Username}, nil
}

func (r *Repository) ListUnassignedStudents(ctx context.Context, tenantID, yearID uuid.UUID, search string, page service.Page) ([]service.StudentSummary, int64, error) {
	rows, err := r.queries(ctx).AcademicListUnassignedStudents(ctx, db.AcademicListUnassignedStudentsParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: page.Limit, Offset: page.Offset, Search: pdatabase.Text(search),
	})
	if err != nil {
		return nil, 0, err
	}
	students := make([]service.StudentSummary, len(rows))
	var total int64
	for i, row := range rows {
		students[i] = service.StudentSummary{ID: row.User.ID, Name: row.User.Name, Username: row.User.Username}
		total = row.TotalCount
	}
	return students, total, nil
}
