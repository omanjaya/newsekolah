package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// staffRecordWorld is one tenant with an active academic year, one class,
// one enrolled student, one duty teacher and a two-period day, enough to
// exercise both RecordExitPermitByStaff and RecordLateArrivalByStaff
// without a QR token ever being minted.
type staffRecordWorld struct {
	tenantID, classID          uuid.UUID
	studentID, dutyTeacherID   uuid.UUID
	startPeriodID, endPeriodID uuid.UUID
}

func seedStaffRecordWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) staffRecordWorld {
	t.Helper()
	q := db.New(pool)
	var w staffRecordWorld

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	w.tenantID = tn.ID

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: w.tenantID, Label: "2025/2026",
		StartsOn: database.Date(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)
	yearID := year.ID

	var gradeLevelID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`,
		w.tenantID,
	).Scan(&gradeLevelID))

	class, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: w.tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)
	w.classID = class.ID

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student-" + slug, PasswordHash: "x", Name: "Siswa Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.studentID = student.ID

	duty, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "piket-" + slug, PasswordHash: "x", Name: "Guru Piket Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.dutyTeacherID = duty.ID

	_, err = pool.Exec(ctx,
		`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
		w.tenantID, yearID, w.studentID, w.classID,
	)
	require.NoError(t, err)

	template, err := q.AcademicCreatePeriodTemplate(ctx, db.AcademicCreatePeriodTemplateParams{TenantID: w.tenantID, Name: "Default", IsDefault: true})
	require.NoError(t, err)

	startPeriod, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 1", Sequence: 1,
		StartsAt: pgtype.Time{Microseconds: int64(7 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)
	w.startPeriodID = startPeriod.ID

	endPeriod, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 2", Sequence: 2,
		StartsAt: pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(9 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)
	w.endPeriodID = endPeriod.ID

	return w
}

// TestRecordExitPermitByStaffCompletesInOneStep covers a duty teacher
// recording an exit permit for a student who is not carrying a phone: the
// call must open and close the same workflow_instances/exit_permits rows
// a QR-driven permit would end up with (completed, issued and exited),
// attributed to the duty teacher rather than the student, force attendance
// for the covered periods exactly like a security gate scan does, and
// still respect the "one exit permit per day" rule a second call trips.
func TestRecordExitPermitByStaffCompletesInOneStep(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedStaffRecordWorld(t, ctx, pg.AdminPool, "staff-exit-"+uuid.NewString())

	sync := &fakeAttendanceSync{}
	svc := buildLeaveService(pg.AppPool, sync)

	detail, err := svc.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err)

	require.Equal(t, domain.StatusCompleted, detail.Instance.Status, "a staff-recorded permit must land completed, not awaiting a gate scan")
	require.NotNil(t, detail.Instance.ClosedAt)
	require.True(t, detail.Instance.CreatedBy.Valid)
	require.Equal(t, w.dutyTeacherID, detail.Instance.CreatedBy.UUID, "created_by is the duty teacher, not the student, so the record's origin is auditable")
	require.Equal(t, w.studentID, detail.Instance.SubjectUserID, "the subject is still the student the permit is for")

	require.True(t, detail.Permit.IsIssued())
	require.True(t, detail.Permit.HasExited())
	require.True(t, detail.Permit.SecurityUserID.Valid)
	require.Equal(t, w.dutyTeacherID, detail.Permit.SecurityUserID.UUID)

	require.NotEmpty(t, detail.Events, "at least one event records the transition")
	last := detail.Events[len(detail.Events)-1]
	require.Equal(t, domain.VerificationManual, last.Verification, "a desk record has no QR scan behind it")
	require.True(t, last.ActorUserID.Valid)
	require.Equal(t, w.dutyTeacherID, last.ActorUserID.UUID)

	require.Len(t, sync.calls, 1, "attendance must be forced for the covered periods exactly like a gate scan does")
	require.Equal(t, w.studentID, sync.calls[0].studentUserID)
	require.Equal(t, "D", sync.calls[0].statusCode)

	// Same student, same day: the normal "one exit permit per day" guard
	// still applies to a staff-recorded permit.
	_, err = svc.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Jemput adik",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.ErrorIs(t, err, domain.ErrExitPermitAlreadyToday)

	// The completed permit reads back the same way through the normal
	// GetExitPermit path any review screen or report uses.
	persisted, err := svc.GetExitPermit(ctx, w.tenantID, detail.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, domain.StatusCompleted, persisted.Instance.Status)
	require.Equal(t, "Puskesmas", persisted.Permit.Destination)
}

// TestRecordLateArrivalByStaffCompletesInOneStepAndCountsOccurrences
// covers a duty teacher recording a late arrival for a student at the
// gate: the call must open and close the same
// workflow_instances/late_arrivals rows a QR-driven flow would end up
// with, attributed to the duty teacher, and occurrence counting (and the
// required-action ladder it drives) must keep counting across repeated
// staff-recorded late arrivals the same way it does for self-service ones.
func TestRecordLateArrivalByStaffCompletesInOneStepAndCountsOccurrences(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedStaffRecordWorld(t, ctx, pg.AdminPool, "staff-late-"+uuid.NewString())

	sync := &fakeAttendanceSync{}
	svc := buildLeaveService(pg.AppPool, sync)

	first, err := svc.RecordLateArrivalByStaff(ctx, service.RecordLateArrivalByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Reason: "Macet",
		HomeroomReported: true, RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err)

	require.Equal(t, domain.StatusCompleted, first.Instance.Status)
	require.True(t, first.Instance.CreatedBy.Valid)
	require.Equal(t, w.dutyTeacherID, first.Instance.CreatedBy.UUID)
	require.Equal(t, 1, first.LateArrival.OccurrenceNumber)
	require.Equal(t, domain.RequiredActionNone, first.LateArrival.RequiredAction, "the 1st occurrence carries no required action by default")
	require.True(t, first.LateArrival.HomeroomReported)
	require.True(t, first.LateArrival.DutyTeacherUserID.Valid)
	require.Equal(t, w.dutyTeacherID, first.LateArrival.DutyTeacherUserID.UUID)
	require.NotNil(t, first.LateArrival.CompletedAt)

	// RecordLateArrivalByStaff itself does not populate Events (matching
	// ReviewLateArrival's own return shape); fetch the full detail the way
	// a detail screen would to see the event history.
	persistedFirst, err := svc.GetLateArrival(ctx, w.tenantID, first.Instance.ID)
	require.NoError(t, err)
	require.NotEmpty(t, persistedFirst.Events, "at least one event records the transition")
	last := persistedFirst.Events[len(persistedFirst.Events)-1]
	require.Equal(t, domain.VerificationManual, last.Verification)
	require.True(t, last.ActorUserID.Valid)
	require.Equal(t, w.dutyTeacherID, last.ActorUserID.UUID)

	// A second staff-recorded late arrival for the same student must be
	// its own instance (late arrivals carry no exit-permit-style
	// one-per-day guard) and must count as occurrence 2, which the
	// default policy maps to "call parent".
	second, err := svc.RecordLateArrivalByStaff(ctx, service.RecordLateArrivalByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Reason: "Bangun kesiangan",
		RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err)
	require.NotEqual(t, first.Instance.ID, second.Instance.ID)
	require.Equal(t, 2, second.LateArrival.OccurrenceNumber)
	require.Equal(t, domain.RequiredActionCallParent, second.LateArrival.RequiredAction)
	require.False(t, second.LateArrival.HomeroomReported, "homeroom_reported defaults to false when the caller omits it")

	persisted, err := svc.GetLateArrival(ctx, w.tenantID, second.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, domain.StatusCompleted, persisted.Instance.Status)
	require.Equal(t, 2, persisted.LateArrival.OccurrenceNumber)
}
