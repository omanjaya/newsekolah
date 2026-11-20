package wiring

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics"
	analyticsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestEarlyWarningFollowsDisciplineChanges is the regression test for the
// early-warning screens and the student profile summary reading "0 poin,
// Aman" beside an issued SP 3: the stored risk results were only written
// by the nightly run. Recording a violation now rescores the student in
// the same transaction, voiding it rescores them again, and replacing the
// scoring policy rescores the school under the new version.
func TestEarlyWarningFollowsDisciplineChanges(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	bus := events.NewBus()
	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Bus: bus, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})
	gradingModule := grading.Register(grading.Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	analyticsModule := analytics.Register(analytics.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service,
		Discipline: AnalyticsDiscipline{Svc: disciplineModule.Service, Flags: platformSvc},
		Grading:    AnalyticsGrading{Svc: gradingModule.Service, Flags: platformSvc},
		Flags:      platformSvc, Clock: clock.Real{},
	})
	RegisterAnalyticsRecompute(bus, analyticsModule.Service, slog.Default())

	fx := seedGradeLevelFixture(t, pg.AdminPool)
	student := enrolledStudent(t, pg.AdminPool, fx)
	var violationType uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into violation_types (tenant_id, code, name, points) values ($1, 'BLS', 'Bolos', 60) returning id`,
		fx.tenantID).Scan(&violationType))

	risk := func() (int, bool, int) {
		t.Helper()
		got, err := analyticsModule.Service.GetStudentRisk(ctx, fx.tenantID, uuid.Nil, student, true)
		require.NoError(t, err)
		return got.Signals.DisciplinePoints, hasReason(got.Reasons, analyticsdomain.ReasonDisciplineAtRisk), got.PolicyVersion
	}

	result, err := disciplineModule.Service.RecordViolation(ctx, fx.tenantID, disciplineservice.RecordInput{
		StudentUserID: student, ViolationTypeID: violationType, OccurredOn: time.Now(), ReporterUserID: student,
	})
	require.NoError(t, err)
	points, atRisk, _ := risk()
	require.Equal(t, 60, points, "the violation counts without waiting for the nightly run")
	require.True(t, atRisk)

	_, err = disciplineModule.Service.VoidViolation(ctx, fx.tenantID, result.Record.ID, student, "salah catat")
	require.NoError(t, err)
	points, atRisk, _ = risk()
	require.Zero(t, points, "a voided violation stops counting at once")
	require.False(t, atRisk)

	policy, err := analyticsModule.Service.Policy(ctx, fx.tenantID)
	require.NoError(t, err)
	updated, err := analyticsModule.Service.UpdatePolicy(ctx, fx.tenantID, student, policy)
	require.NoError(t, err)
	_, _, version := risk()
	require.Equal(t, updated.Version, version, "the school is rescored under the new policy right away")
}
