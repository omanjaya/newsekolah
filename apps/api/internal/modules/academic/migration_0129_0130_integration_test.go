package academic

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
)

// TestMigrations0129And0130UpgradeDataTheOldAPIAccepted runs migrations
// 0129 (term boundary repair) and 0130 (unique subject offerings) over the
// data the API used to accept: default terms sharing their boundary day, a
// third term an admin placed across both semesters, and a duplicate
// offering. The upgrade must complete -- a failing migration stops the API
// from booting -- repair the boundary, leave the cross-semester term for
// the admin, and keep the oldest of the duplicate offerings.
func TestMigrations0129And0130UpgradeDataTheOldAPIAccepted(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	pool := pg.AdminPool
	// dbtest.Start applies every migration; step back to just before 0129
	// by number, so the seed below is the data 0129 and 0130 meet.
	m, err := migrator.New(pg.DSN)
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = m.Close() })
	require.NoError(t, m.Migrate(128))

	fx := seedRosterFixture(t, pool)
	q := db.New(pool)

	insertTerm := func(name string, seq int16, startsOn, endsOn time.Time) uuid.UUID {
		term, err := q.AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
			TenantID: fx.tenantID, AcademicYearID: fx.yearID, Name: name, Sequence: seq,
			StartsOn: database.Date(startsOn), EndsOn: database.Date(endsOn),
		})
		require.NoError(t, err)
		return term.ID
	}
	sem1 := insertTerm("Semester 1", 1, date(2026, 7, 13), date(2026, 12, 31))
	sem2 := insertTerm("Semester 2", 2, date(2026, 12, 31), date(2027, 6, 30))
	across := insertTerm("Semester X tumpang", 3, date(2026, 12, 1), date(2027, 1, 30))

	kimia, err := q.AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{TenantID: fx.tenantID, Code: "KIM", Name: "Kimia"})
	require.NoError(t, err)
	offer := func(hours int16) uuid.UUID {
		o, err := q.AcademicCreateSubjectOffering(ctx, db.AcademicCreateSubjectOfferingParams{
			TenantID: fx.tenantID, AcademicYearID: fx.yearID, SubjectID: kimia.ID,
			GradeLevelID: pgtype.UUID{Bytes: fx.gradeLevelID, Valid: true}, HoursPerWeek: hours,
		})
		require.NoError(t, err)
		return o.ID
	}
	first := offer(3)
	offer(2)

	require.NoError(t, m.Migrate(130))

	termDates := func(id uuid.UUID) (string, string) {
		var startsOn, endsOn time.Time
		require.NoError(t, pool.QueryRow(ctx, `select starts_on, ends_on from terms where id = $1`, id).Scan(&startsOn, &endsOn))
		return startsOn.Format(time.DateOnly), endsOn.Format(time.DateOnly)
	}
	start, end := termDates(sem1)
	require.Equal(t, [2]string{"2026-07-13", "2026-12-31"}, [2]string{start, end})
	start, end = termDates(sem2)
	require.Equal(t, [2]string{"2027-01-01", "2027-06-30"}, [2]string{start, end}, "the shared boundary day moves to the later term's start")
	start, end = termDates(across)
	require.Equal(t, [2]string{"2026-12-01", "2027-01-30"}, [2]string{start, end}, "an overlap with no safe fix is left for the admin")

	var offeringIDs []uuid.UUID
	rows, err := pool.Query(ctx, `select id from subject_offerings where subject_id = $1`, kimia.ID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		require.NoError(t, rows.Scan(&id))
		offeringIDs = append(offeringIDs, id)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []uuid.UUID{first}, offeringIDs)
}
