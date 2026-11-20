package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestCorrectionWindowIsTheSchoolsSetting: past the default 7-day window
// nobody may correct a session, the school admin included; once the
// school lengthens attendance.correction_days the same correction goes
// through, and the change is audited (audit attendance-time-R2).
func TestCorrectionWindowIsTheSchoolsSetting(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "correction-setting")
	admin := service.Actor{UserID: w.otherTeacherID, CanManage: true, CanViewAll: true, IsGlobalCorrector: true}

	settings, err := svc.AttendanceSettings(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 7, settings.CorrectionDays, "unset reads as the default")

	opened, err := svc.OpenSession(ctx, w.tenantID, admin, w.scheduleTodayID, w.today, domain.SaveModeCorrection)
	require.NoError(t, err)

	// Ten days later the default window has closed for everyone.
	later := clock.WithTime(ctx, w.today.Add(10*24*time.Hour+9*time.Hour))
	correction := service.SaveEntriesInput{
		Mode: domain.SaveModeCorrection, Reason: "Salah input",
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "S"}},
	}
	_, err = svc.SaveEntries(later, w.tenantID, admin, opened.Session.ID, correction)
	require.ErrorIs(t, err, domain.ErrCorrectionWindowClosed)

	_, err = svc.UpdateAttendanceSettings(ctx, w.tenantID, w.otherTeacherID, service.Settings{CorrectionDays: 0})
	require.ErrorIs(t, err, domain.ErrInvalidCorrectionDays)
	_, err = svc.UpdateAttendanceSettings(ctx, w.tenantID, w.otherTeacherID, service.Settings{CorrectionDays: 91})
	require.ErrorIs(t, err, domain.ErrInvalidCorrectionDays)

	updated, err := svc.UpdateAttendanceSettings(ctx, w.tenantID, w.otherTeacherID, service.Settings{CorrectionDays: 14})
	require.NoError(t, err)
	require.Equal(t, 14, updated.CorrectionDays)
	settings, err = svc.AttendanceSettings(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 14, settings.CorrectionDays)

	detail, err := svc.GetSessionDetail(later, w.tenantID, admin, opened.Session.ID)
	require.NoError(t, err)
	require.NotNil(t, detail.EditableUntil)
	require.True(t, domain.CorrectionDeadline(w.today, 14, time.UTC).Equal(*detail.EditableUntil))

	_, err = svc.SaveEntries(later, w.tenantID, admin, opened.Session.ID, correction)
	require.NoError(t, err, "the longer window reopens the session for correction")

	var audited int
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select count(*) from audit_logs where tenant_id = $1 and action = 'attendance_settings.update'
		   and before->>'correction_days' = '7' and after->>'correction_days' = '14'`, w.tenantID,
	).Scan(&audited))
	require.Equal(t, 1, audited)
}
