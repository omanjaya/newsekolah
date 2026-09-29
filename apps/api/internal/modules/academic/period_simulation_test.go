package academic

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// isoWeekdayOf mirrors transport/http's unexported isoWeekday: Go's
// Sunday=0 weekday mapped onto the schema's Monday=1..Sunday=7 convention.
func isoWeekdayOf(t time.Time) int16 {
	if t.Weekday() == time.Sunday {
		return 7
	}
	return int16(t.Weekday())
}

// TestGetPeriodTodayFollowsSimulatedTime proves GetPeriodToday -- the one
// endpoint docs/testing-time-simulation.md calls out as needing the
// tenant's local wall-clock time -- resolves "today" from the request's
// simulated business time (X-Simulation-Time, attached to ctx via
// clock.WithTime by cmd/api's middleware) instead of always the process
// clock. The weekday assignment lives only on a weekday distinct from
// whatever weekday the real clock currently is, so a request with no
// simulation attached (the real clock) deterministically finds nothing,
// regardless of what day the test happens to run on.
func TestGetPeriodTodayFollowsSimulatedTime(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "period-sim-" + uuid.NewString(), Name: "Period Sim", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	tenantID := tn.ID

	mod := Register(pg.AppPool, clock.Real{})

	year, err := mod.Service.CreateAcademicYear(ctx, tenantID, "2026/2027",
		time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)

	template, err := mod.Service.CreatePeriodTemplate(ctx, tenantID, "Default", true)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	nowLocal := time.Now().In(loc)
	todayISO := isoWeekdayOf(nowLocal)
	// otherISO is always a different weekday than today's real one (the
	// 1..7 range wraps at 7 -> 1), so the fixture's assignment never
	// coincides with whatever day the suite happens to run on.
	otherISO := todayISO%7 + 1

	morning, err := mod.Service.CreatePeriod(ctx, domain.Period{
		TenantID: tenantID, TemplateID: template.ID, Name: "P1", Sequence: 1,
		StartsAt: domain.ClockTime{Hour: 8, Minute: 0}, EndsAt: domain.ClockTime{Hour: 9, Minute: 0},
	})
	require.NoError(t, err)
	afternoon, err := mod.Service.CreatePeriod(ctx, domain.Period{
		TenantID: tenantID, TemplateID: template.ID, Name: "P2", Sequence: 2,
		StartsAt: domain.ClockTime{Hour: 10, Minute: 0}, EndsAt: domain.ClockTime{Hour: 11, Minute: 0},
	})
	require.NoError(t, err)

	require.NoError(t, mod.Service.SetWeekdayAssignment(ctx, tenantID, year.ID, template.ID, otherISO))

	reqCtx := tenant.WithTenant(ctx, tenant.Tenant{ID: tenantID, Timezone: "Asia/Jakarta", Locale: "id"})
	request := api.GetPeriodTodayRequestObject{Params: api.GetPeriodTodayParams{AcademicYearId: year.ID}}

	// No simulation attached: the real clock's weekday has no assignment,
	// so this must always be "not found" -- never a coincidental match.
	_, err = mod.Handler.GetPeriodToday(reqCtx, request)
	require.ErrorIs(t, err, httpx.ErrNotFound, "the real clock's weekday must have no period assigned")

	// daysAhead lands on otherISO's next occurrence, 1..6 days out.
	daysAhead := int(otherISO - todayISO)
	if daysAhead <= 0 {
		daysAhead += 7
	}
	simulatedDay := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day()+daysAhead, 0, 0, 0, 0, loc)

	atMorning := simulatedDay.Add(8 * time.Hour).Add(30 * time.Minute).UTC()
	simCtx := clock.WithTime(reqCtx, atMorning)
	resp, err := mod.Handler.GetPeriodToday(simCtx, request)
	require.NoError(t, err)
	require.Equal(t, morning.ID, resp.(api.GetPeriodToday200JSONResponse).Id, "08:30 on the simulated weekday must resolve to the morning period")

	atAfternoon := simulatedDay.Add(10 * time.Hour).Add(15 * time.Minute).UTC()
	simCtx = clock.WithTime(reqCtx, atAfternoon)
	resp, err = mod.Handler.GetPeriodToday(simCtx, request)
	require.NoError(t, err)
	require.Equal(t, afternoon.ID, resp.(api.GetPeriodToday200JSONResponse).Id, "10:15 on the simulated weekday must resolve to the afternoon period")

	outsideAnyPeriod := simulatedDay.Add(20 * time.Hour).UTC()
	simCtx = clock.WithTime(reqCtx, outsideAnyPeriod)
	_, err = mod.Handler.GetPeriodToday(simCtx, request)
	require.ErrorIs(t, err, httpx.ErrNotFound, "20:00 on the simulated weekday falls outside both periods")
}
