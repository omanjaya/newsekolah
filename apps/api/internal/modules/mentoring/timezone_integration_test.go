package mentoring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// monthRecorder is an AttendanceReader that remembers which month the
// snapshot asked for.
type monthRecorder struct{ months []string }

func (m *monthRecorder) MonthlyStatusCounts(_ context.Context, _, _ uuid.UUID, month string) (map[string]int, error) {
	m.months = append(m.months, month)
	return map[string]int{}, nil
}

// TestStudentSnapshotMonthIsTenantLocalMonth is the timezone sweep's
// regression test for the mentor's student snapshot: "this month" at 23:30
// UTC on 31 October is November for an Asia/Makassar school (07:30 on 1
// November local), not the UTC month of the instant.
func TestStudentSnapshotMonthIsTenantLocalMonth(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedMentoringFixture(t, pg.AdminPool)
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, fx.tenantID)
	require.NoError(t, err)

	sealer, err := crypto.NewSealer("v1", "a-test-secret-of-at-least-32-bytes!")
	require.NoError(t, err)
	attendance := &monthRecorder{}
	mod := Register(Dependencies{
		Pool: pg.AppPool, Years: school.Register(pg.AppPool, tenant.ModeSingle, nil).Service, Sealer: sealer,
		Attendance: attendance, Clock: clock.Frozen{At: time.Date(2026, 10, 31, 23, 30, 0, 0, time.UTC)},
	})

	_, err = mod.Service.StudentSnapshot(ctx, fx.tenantID, schoolWide, fx.studentID)
	require.NoError(t, err)
	// The simulated business clock is converted the same way.
	_, err = mod.Service.StudentSnapshot(clock.WithTime(ctx, time.Date(2026, 12, 31, 16, 0, 0, 0, time.UTC)), fx.tenantID, schoolWide, fx.studentID)
	require.NoError(t, err)

	require.Equal(t, []string{"2026-11", "2027-01"}, attendance.months)
}
