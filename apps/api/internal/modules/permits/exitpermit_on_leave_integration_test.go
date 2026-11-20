package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestExitPermitRefusedWhileOnIssuedLeave is the regression test for an
// exit permit going through for a student an issued leave letter marks
// absent today (its gate scan then replaced the letter's S with D). Both
// the student's own request and the duty teacher's desk record refuse it.
func TestExitPermitRefusedWhileOnIssuedLeave(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "exit-on-leave-"+uuid.NewString())
	svc := buildLeaveService(pg.AppPool, &fakeAttendanceSync{})

	q := db.New(pg.AdminPool)
	template, err := q.AcademicCreatePeriodTemplate(ctx, db.AcademicCreatePeriodTemplateParams{TenantID: w.tenantID, Name: "Default", IsDefault: true})
	require.NoError(t, err)
	period, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 1", Sequence: 1,
		StartsAt: pgtype.Time{Microseconds: int64(7 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)

	// The leave covers the tenant's own today (Asia/Jakarta).
	jakarta, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	y, m, d := time.Now().In(jakarta).Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)

	submitted, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: today, EndsOn: today,
	})
	require.NoError(t, err)
	_, err = svc.ReviewLeaveRequest(ctx, w.tenantID, submitted.Instance.ID, w.homeroomTeacherID, true, "")
	require.NoError(t, err)
	_, err = svc.IssueLeaveLetter(ctx, w.tenantID, submitted.Instance.ID, w.counselorID)
	require.NoError(t, err)

	_, _, err = svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Klinik gigi",
		StartPeriodID: period.ID, EndPeriodID: period.ID,
	})
	require.ErrorIs(t, err, domain.ErrStudentOnLeaveToday)

	_, err = svc.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Klinik gigi",
		StartPeriodID: period.ID, EndPeriodID: period.ID, RecordedBy: w.homeroomTeacherID,
	})
	require.ErrorIs(t, err, domain.ErrStudentOnLeaveToday)
}
