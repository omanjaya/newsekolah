package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// GetUserName resolves userID's display name, for the class roster
// export's "Wali Kelas" signer.
func (r *Repository) GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	return r.queries(ctx).AcademicGetUserNameForExport(ctx, db.AcademicGetUserNameForExportParams{TenantID: tenantID, ID: userID})
}

// ListClassRosterForExport resolves classID's actively enrolled students
// for the class roster export, in AcademicListClassRosterForExport's own
// order (by name).
func (r *Repository) ListClassRosterForExport(ctx context.Context, tenantID, classID uuid.UUID) ([]service.RosterStudent, error) {
	rows, err := r.queries(ctx).AcademicListClassRosterForExport(ctx, db.AcademicListClassRosterForExportParams{TenantID: tenantID, ClassID: classID})
	if err != nil {
		return nil, err
	}
	out := make([]service.RosterStudent, len(rows))
	for i, row := range rows {
		student := service.RosterStudent{
			StudentUserID: row.StudentUserID, Name: row.Name, NIS: row.Nis, NISN: row.Nisn,
			Gender: pdatabase.TextOrEmpty(row.Gender), BirthPlace: pdatabase.TextOrEmpty(row.BirthPlace),
			GuardianName: row.GuardianName,
		}
		if row.BirthDate.Valid {
			t := row.BirthDate.Time
			student.BirthDate = &t
		}
		out[i] = student
	}
	return out, nil
}
