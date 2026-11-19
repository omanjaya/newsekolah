package academic

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestListSubjectOfferingsInReadingOrder pins the offerings list order the
// admin reads them in: the all-grades offerings first, then grade by grade
// in the school's sequence (not by name), each grade's subjects by name,
// whatever order they were added in.
func TestListSubjectOfferingsInReadingOrder(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedRosterFixture(t, pg.AdminPool)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	// Named so that alphabetical order would put it before "Kelas X".
	gradeXI, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{
		TenantID: fx.tenantID, Code: "XI", Name: "A Kelas XI", Sequence: 2,
	})
	require.NoError(t, err)

	subjectIDs := map[string]uuid.UUID{}
	for _, name := range []string{"Sejarah", "Biologi", "Matematika", "Agama"} {
		subject, err := q.AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{
			TenantID: fx.tenantID, Code: name, Name: name,
		})
		require.NoError(t, err)
		subjectIDs[name] = subject.ID
	}
	offer := func(subject string, grade *uuid.UUID) {
		t.Helper()
		gradeID := pgtype.UUID{}
		if grade != nil {
			gradeID = pgtype.UUID{Bytes: *grade, Valid: true}
		}
		_, err := q.AcademicCreateSubjectOffering(ctx, db.AcademicCreateSubjectOfferingParams{
			TenantID: fx.tenantID, AcademicYearID: fx.yearID, SubjectID: subjectIDs[subject],
			GradeLevelID: gradeID, HoursPerWeek: 2,
		})
		require.NoError(t, err)
	}
	gradeX := fx.gradeLevelID
	offer("Sejarah", &gradeXI.ID)
	offer("Biologi", &gradeX)
	offer("Sejarah", &gradeX)
	offer("Matematika", &gradeXI.ID)
	offer("Agama", nil)
	offer("Biologi", &gradeXI.ID)

	svc := Register(pg.AppPool, clock.Real{}).Service
	offerings, err := svc.ListSubjectOfferings(ctx, fx.tenantID, fx.yearID)
	require.NoError(t, err)

	nameOf := map[uuid.UUID]string{}
	for name, id := range subjectIDs {
		nameOf[id] = name
	}
	type row struct{ grade, subject string }
	got := make([]row, len(offerings))
	for i, o := range offerings {
		grade := "all"
		switch {
		case o.GradeLevelID == nil:
		case *o.GradeLevelID == gradeX:
			grade = "X"
		case *o.GradeLevelID == gradeXI.ID:
			grade = "XI"
		}
		got[i] = row{grade, nameOf[o.SubjectID]}
	}
	require.Equal(t, []row{
		{"all", "Agama"},
		{"X", "Biologi"},
		{"X", "Sejarah"},
		{"XI", "Biologi"},
		{"XI", "Matematika"},
		{"XI", "Sejarah"},
	}, got)
}
