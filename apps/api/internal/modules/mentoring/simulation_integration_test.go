package mentoring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// mentoringFixture is one tenant with an active academic year, a mentor, a
// student to mentor, and a separate user who will later be assigned a
// counselor duty.
type mentoringFixture struct {
	tenantID    uuid.UUID
	yearID      uuid.UUID
	mentorID    uuid.UUID
	studentID   uuid.UUID
	counselorID uuid.UUID
}

func seedMentoringFixture(t *testing.T, adminPool *pgxpool.Pool) mentoringFixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(adminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "mentoring-test-" + uuid.NewString(), Name: "Mentoring Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantRow.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	mentor, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "wali-" + uuid.NewString(), PasswordHash: "x",
		Name: "Wali Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "siswa-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	counselor, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "guru-bk-" + uuid.NewString(), PasswordHash: "x",
		Name: "Guru BK Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	return mentoringFixture{
		tenantID: tenantRow.ID, yearID: year.ID, mentorID: mentor.ID, studentID: student.ID, counselorID: counselor.ID,
	}
}

// newTestMentoringModule wires the mentoring module against appPool -- the
// least-privilege app_rw role, so row level security applies exactly like
// production -- never the admin pool used for fixture seeding.
func newTestMentoringModule(t *testing.T, appPool *pgxpool.Pool) *Module {
	t.Helper()
	sealer, err := crypto.NewSealer("v1", "a-test-secret-of-at-least-32-bytes!")
	require.NoError(t, err)
	schoolModule := school.Register(appPool, tenant.ModeSingle, nil)
	return Register(Dependencies{
		Pool: appPool, Years: schoolModule.Service, Sealer: sealer, Clock: clock.Real{},
	})
}

// TestSimulatedFutureDutyHonoredWithinSimulatedWindow proves
// MentoringHasActiveDuty (noteReaderRole's counselor check) reads its
// "today" from the simulated clock: a counselor duty whose starts_on is
// well into the future is not yet active under the real wall-clock date,
// but becomes active once a request carries a simulated date that falls
// inside the duty's [starts_on, ends_on] window -- the fix
// cross_module.sql's MentoringHasActiveDuty now documents (sqlc.arg
// ('today') instead of bare current_date).
func TestSimulatedFutureDutyHonoredWithinSimulatedWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedMentoringFixture(t, pg.AdminPool)
	mod := newTestMentoringModule(t, pg.AppPool)

	group, err := mod.Service.CreateGroup(ctx, fx.tenantID, service.GroupInput{MentorUserID: fx.mentorID, Name: "Grup A"})
	require.NoError(t, err)

	note, err := mod.Service.CreateMeetingNote(ctx, fx.tenantID, fx.mentorID, service.MeetingNoteInput{
		GroupID: group.ID, MetAt: time.Now(), Kind: domain.MeetingIndividual, AttendeeUserIDs: []uuid.UUID{fx.studentID},
		Topic: "Topik", Content: "Isi catatan", AgreedActions: "Tindak lanjut",
	})
	require.NoError(t, err)

	q := db.New(pg.AdminPool)
	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: fx.tenantID, Slug: "counselor", Name: "Guru BK", ScopeKind: "school",
	})
	require.NoError(t, err)

	futureStart := time.Now().AddDate(0, 0, 10)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, DutyTypeID: dutyType.ID, UserID: fx.counselorID,
		StartsOn: database.Date(futureStart),
	})
	require.NoError(t, err)

	// Without a simulation header, the real wall-clock date is still
	// before starts_on, so the duty is not yet active and the counselor
	// (not the note's author) cannot open it.
	_, err = mod.Service.GetMeetingNote(ctx, fx.tenantID, note.ID, fx.counselorID)
	require.ErrorIs(t, err, domain.ErrNoteForbidden,
		"the duty starts in the future, so without simulation it must not be active yet")

	// A simulated date inside the (open-ended) window starting at
	// futureStart must honor the duty.
	simCtx := clock.WithTime(ctx, futureStart.AddDate(0, 0, 2))
	_, err = mod.Service.GetMeetingNote(simCtx, fx.tenantID, note.ID, fx.counselorID)
	require.NoError(t, err, "a simulated date inside the duty's window must be honored")
}
