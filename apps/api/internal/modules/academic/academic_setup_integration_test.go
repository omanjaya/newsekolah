package academic

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func date(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// TestCreateAndUpdateTermRejectOverlapAndOutsideYear reproduces the
// "Semester X tumpang" save (1 Dec - 30 Jan across both semesters), which
// used to be accepted, and the API-only gap of a term outside its year.
// It also proves the database exclusion constraint backs the service check
// up for a write that never went through it.
func TestCreateAndUpdateTermRejectOverlapAndOutsideYear(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedRosterFixture(t, pg.AdminPool) // year 2026-07-01 .. 2027-06-30
	ctx := context.Background()
	svc := Register(pg.AppPool, clock.Real{}).Service

	sem1, err := svc.CreateTerm(ctx, fx.tenantID, fx.yearID, "Semester 1", 1, date(2026, 7, 13), date(2026, 12, 20))
	require.NoError(t, err)
	sem2, err := svc.CreateTerm(ctx, fx.tenantID, fx.yearID, "Semester 2", 2, date(2027, 1, 4), date(2027, 6, 18))
	require.NoError(t, err)

	_, err = svc.CreateTerm(ctx, fx.tenantID, fx.yearID, "Semester X tumpang", 3, date(2026, 12, 1), date(2027, 1, 30))
	require.ErrorIs(t, err, domain.ErrTermOverlap)

	_, err = svc.CreateTerm(ctx, fx.tenantID, fx.yearID, "Sebelum tahun", 3, date(2026, 6, 1), date(2026, 6, 30))
	require.ErrorIs(t, err, domain.ErrTermOutsideYear)

	_, err = svc.UpdateTerm(ctx, fx.tenantID, sem1.ID, "Semester 1", date(2026, 7, 13), date(2027, 1, 4))
	require.ErrorIs(t, err, domain.ErrTermOverlap, "moving semester 1's end onto semester 2's first day")

	renamed, err := svc.UpdateTerm(ctx, fx.tenantID, sem2.ID, "Semester Genap", date(2027, 1, 4), date(2027, 6, 18))
	require.NoError(t, err, "editing a term in place must not collide with itself")
	require.Equal(t, "Semester Genap", renamed.Name)

	terms, err := svc.ListTerms(ctx, fx.tenantID, fx.yearID)
	require.NoError(t, err)
	require.Len(t, terms, 2)

	// The backstop: a direct insert that skips the service check.
	_, err = db.New(pg.AdminPool).AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, Name: "Langsung", Sequence: 4,
		StartsOn: database.Date(date(2026, 12, 20)), EndsOn: database.Date(date(2026, 12, 31)),
	})
	require.ErrorContains(t, err, "ex_terms_no_overlap")
}

// TestCreateAcademicYearDefaultTermsDoNotOverlap proves a year created
// with generated default terms still saves now that terms may not share a
// day (the generated terms used to share each boundary day).
func TestCreateAcademicYearDefaultTermsDoNotOverlap(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedRosterFixture(t, pg.AdminPool)
	ctx := context.Background()
	svc := Register(pg.AppPool, clock.Real{}).Service

	year, err := svc.CreateAcademicYear(ctx, fx.tenantID, "2027/2028", date(2027, 7, 12), date(2028, 6, 30))
	require.NoError(t, err)
	terms, err := svc.ListTerms(ctx, fx.tenantID, year.ID)
	require.NoError(t, err)
	require.Len(t, terms, 2)
	require.Equal(t, terms[0].EndsOn.AddDate(0, 0, 1), terms[1].StartsOn)
}

// TestSubjectOfferingIsUniquePerYearSubjectGrade reproduces the second
// "Kimia / Kelas X" offering that used to be saved beside the first: the
// service already mapped a unique violation to ErrSubjectOfferingExists,
// but the table had no unique constraint. Moving an offering onto an
// already offered grade is refused the same way, and so is a second
// "all grades" offering of one subject.
func TestSubjectOfferingIsUniquePerYearSubjectGrade(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedRosterFixture(t, pg.AdminPool)
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	svc := Register(pg.AppPool, clock.Real{}).Service

	kimia, err := q.AcademicCreateSubject(ctx, db.AcademicCreateSubjectParams{TenantID: fx.tenantID, Code: "KIM", Name: "Kimia"})
	require.NoError(t, err)
	gradeXI, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{TenantID: fx.tenantID, Code: "XI", Name: "Kelas XI", Sequence: 2})
	require.NoError(t, err)

	gradeX := fx.gradeLevelID
	offer := func(grade *uuid.UUID, hours int16) (domain.SubjectOffering, error) {
		return svc.CreateSubjectOffering(ctx, domain.SubjectOffering{
			TenantID: fx.tenantID, AcademicYearID: fx.yearID, SubjectID: kimia.ID, GradeLevelID: grade, HoursPerWeek: hours,
		})
	}

	_, err = offer(&gradeX, 3)
	require.NoError(t, err)
	_, err = offer(&gradeX, 2)
	require.ErrorIs(t, err, domain.ErrSubjectOfferingExists)

	inXI, err := offer(&gradeXI.ID, 3)
	require.NoError(t, err)
	_, err = svc.UpdateSubjectOffering(ctx, fx.tenantID, inXI.ID, &gradeX, 3)
	require.ErrorIs(t, err, domain.ErrSubjectOfferingExists)

	_, err = offer(nil, 2)
	require.NoError(t, err)
	_, err = offer(nil, 4)
	require.ErrorIs(t, err, domain.ErrSubjectOfferingExists)

	offerings, err := svc.ListSubjectOfferings(ctx, fx.tenantID, fx.yearID)
	require.NoError(t, err)
	require.Len(t, offerings, 3)
}

// TestHomeroomDutyFromClassFormUsesSchoolDate reproduces a homeroom duty
// created through the class form at 07:58 WITA on 20 November (23:58 UTC
// on the 19th): it used to start on the UTC date, 19 November. Both the
// create-class and the update-class paths must use the school's own date,
// for the new duty's start and the replaced one's end alike.
func TestHomeroomDutyFromClassFormUsesSchoolDate(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedRosterFixture(t, pg.AdminPool)
	ctx := context.Background()
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, fx.tenantID)
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx,
		`insert into duty_types (tenant_id, slug, name, scope_kind) values ($1, 'homeroom', 'Wali Kelas', 'class')`, fx.tenantID)
	require.NoError(t, err)

	newTeacher := func(name string) uuid.UUID {
		u, err := db.New(pg.AdminPool).CreateUser(ctx, db.CreateUserParams{
			TenantID: fx.tenantID, Username: "guru-" + uuid.NewString(), PasswordHash: "x", Name: name, Status: "active", Locale: "id",
		})
		require.NoError(t, err)
		return u.ID
	}
	first, second := newTeacher("Guru Satu"), newTeacher("Guru Dua")

	frozen := clock.Frozen{At: time.Date(2026, 11, 19, 23, 58, 0, 0, time.UTC)}
	svc := Register(pg.AppPool, frozen).Service

	class, err := svc.CreateClass(ctx, domain.Class{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, GradeLevelID: fx.gradeLevelID, Name: "X-C", HomeroomTeacherID: &first,
	})
	require.NoError(t, err)

	class.HomeroomTeacherID = &second
	_, err = svc.UpdateClass(ctx, class)
	require.NoError(t, err)

	rows, err := pg.AdminPool.Query(ctx,
		`select user_id, starts_on, ends_on from duty_assignments where tenant_id = $1 and scope_class_id = $2 order by created_at`,
		fx.tenantID, class.ID)
	require.NoError(t, err)
	defer rows.Close()
	type duty struct {
		userID   uuid.UUID
		startsOn time.Time
		endsOn   *time.Time
	}
	var duties []duty
	for rows.Next() {
		var d duty
		require.NoError(t, rows.Scan(&d.userID, &d.startsOn, &d.endsOn))
		duties = append(duties, d)
	}
	require.NoError(t, rows.Err())
	require.Len(t, duties, 2)

	schoolDate := date(2026, 11, 20)
	require.Equal(t, first, duties[0].userID)
	require.Equal(t, schoolDate, duties[0].startsOn)
	require.NotNil(t, duties[0].endsOn)
	require.Equal(t, schoolDate, *duties[0].endsOn)
	require.Equal(t, second, duties[1].userID)
	require.Equal(t, schoolDate, duties[1].startsOn)
	require.Nil(t, duties[1].endsOn)
}
