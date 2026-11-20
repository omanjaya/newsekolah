package discipline

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestLetterYearAndTodayUseTenantLocalDate is the timezone sweep's
// regression test for discipline: at 23:30 UTC on 31 December an
// Asia/Makassar school (UTC+8) is already at 07:30 on 1 January, so a
// locally numbered warning letter carries the new year and Today (the
// occurred_on of a violation another module records "now") is 1 January.
func TestLetterYearAndTodayUseTenantLocalDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, fx.tenantID)
	require.NoError(t, err)
	mod := newTestDisciplineModule(t, pg.AppPool)
	mod.Service.WithClock(clock.Frozen{At: time.Date(2026, 12, 31, 23, 30, 0, 0, time.UTC)})

	require.Equal(t, time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), mod.Service.Today(ctx, fx.tenantID))
	// A simulated instant is converted the same way.
	require.Equal(t, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC),
		mod.Service.Today(clock.WithTime(ctx, time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)), fx.tenantID))

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{
		TenantID: fx.tenantID, Code: "BLR", Name: "Bolos", Points: 30,
	})
	require.NoError(t, err)
	_, err = mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
		StudentUserID: fx.studentID, ViolationTypeID: vt.ID,
		OccurredOn: time.Date(2026, 12, 30, 0, 0, 0, 0, time.UTC), ReporterUserID: fx.counselorID,
	})
	require.NoError(t, err)

	letter, err := mod.Service.IssueWarningLetter(ctx, fx.tenantID, fx.studentID, fx.counselorID, 1)
	require.NoError(t, err)
	require.Contains(t, letter.LetterNumber, "/2027", "the letter is numbered in the school's own year, got %q", letter.LetterNumber)
}
