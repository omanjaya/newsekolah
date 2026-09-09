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
