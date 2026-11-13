package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics"
	analyticsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	analyticsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

func hasReason(reasons []analyticsdomain.Reason, codes ...analyticsdomain.ReasonCode) bool {
	for _, r := range reasons {
		for _, code := range codes {
			if r.Code == code {
				return true
			}
		}
	}
	return false
}

// TestDisciplineDataDisappearsWhileDisciplineIsOff records one heavy
// violation, then switches discipline off: every always-on reader that
// shows discipline data (early-warning list and detail, the mentor's
// snapshot figures, the homeroom roster) reports none, without an error,
// while the violation itself stays stored; switching discipline back on
// brings everything back.
func TestDisciplineDataDisappearsWhileDisciplineIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})
	gradingModule := grading.Register(grading.Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	analyticsModule := analytics.Register(analytics.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service,
		Discipline: AnalyticsDiscipline{Svc: disciplineModule.Service, Flags: platformSvc},
		Grading:    AnalyticsGrading{Svc: gradingModule.Service, Flags: platformSvc},
		Flags:      platformSvc, Clock: clock.Real{},
	})
	mentoring := MentoringDiscipline{Svc: disciplineModule.Service, Flags: platformSvc}
	homeroom := AttendanceDiscipline{Svc: disciplineModule.Service, Flags: platformSvc}

	fx := seedGradeLevelFixture(t, pg.AdminPool)
	student := enrolledStudent(t, pg.AdminPool, fx)
	var violationType uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into violation_types (tenant_id, code, name, points) values ($1, 'BLS', 'Bolos', 60) returning id`,
		fx.tenantID).Scan(&violationType))
	_, err := disciplineModule.Service.RecordViolation(ctx, fx.tenantID, disciplineservice.RecordInput{
		StudentUserID: student, ViolationTypeID: violationType, OccurredOn: time.Now(), ReporterUserID: student,
	})
	require.NoError(t, err)

	_, err = analyticsModule.Service.Recompute(ctx, fx.tenantID)
	require.NoError(t, err)
	risk, err := analyticsModule.Service.GetStudentRisk(ctx, fx.tenantID, uuid.Nil, student, true)
	require.NoError(t, err)
	require.Equal(t, 60, risk.Signals.DisciplinePoints)
	require.True(t, hasReason(risk.Reasons, analyticsdomain.ReasonDisciplineAtRisk), "discipline on: the points count")
	points, active, err := mentoring.StudentPoints(ctx, fx.tenantID, student)
	require.NoError(t, err)
	require.Equal(t, [2]int{60, 1}, [2]int{points, active})
	roster, err := homeroom.ViolationSummaryForClass(ctx, fx.tenantID, fx.classAID)
	require.NoError(t, err)
	require.Equal(t, 60, roster[student].Points)

	_, err = platformSvc.SetFlag(ctx, fx.tenantID, string(platformdomain.ModuleDiscipline), false)
	require.NoError(t, err)

	// The stored result predates the switch: it is read back without the
	// discipline signal, and the stored row itself is not changed.
	listed, err := analyticsModule.Service.ListAtRiskStudents(ctx, fx.tenantID, uuid.Nil, true)
	require.NoError(t, err)
	var fromList analyticsservice.StoredResult
	for _, r := range listed {
		if r.StudentUserID == student {
			fromList = r
		}
	}
	require.Equal(t, student, fromList.StudentUserID)
	detail, err := analyticsModule.Service.GetStudentRisk(ctx, fx.tenantID, uuid.Nil, student, true)
	require.NoError(t, err)
	for _, got := range []analyticsservice.StoredResult{fromList, detail} {
		require.Zero(t, got.Signals.DisciplinePoints)
		require.Zero(t, got.Signals.ActiveViolationCount)
		require.False(t, hasReason(got.Reasons, analyticsdomain.ReasonDisciplineAtRisk, analyticsdomain.ReasonDisciplineWatch,
			analyticsdomain.ReasonWarningLetterRisk, analyticsdomain.ReasonWarningLetterWatch))
		require.Zero(t, got.Score, "nothing but discipline added to the score")
		require.Equal(t, analyticsdomain.LevelNone, got.Level)
	}
	storedScore := func() int {
		t.Helper()
		var score int
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`select score from analytics_student_risk where student_user_id = $1`, student).Scan(&score))
		return score
	}
	require.Equal(t, risk.Score, storedScore(), "the stored row is left as computed")
	require.Positive(t, risk.Score)

	// A recompute with discipline off ignores the signal outright.
	_, err = analyticsModule.Service.Recompute(ctx, fx.tenantID)
	require.NoError(t, err)
	require.Zero(t, storedScore())

	points, active, err = mentoring.StudentPoints(ctx, fx.tenantID, student)
	require.NoError(t, err)
	require.Zero(t, points+active, "mentoring: no discipline figures")
	roster, err = homeroom.ViolationSummaryForClass(ctx, fx.tenantID, fx.classAID)
	require.NoError(t, err)
	require.Empty(t, roster, "homeroom roster: no discipline figures")
	count, total, err := homeroom.ViolationSummary(ctx, fx.tenantID, fx.yearID, student)
	require.NoError(t, err)
	require.Zero(t, count+total)

	var records int
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select count(*) from violation_records where student_user_id = $1`, student).Scan(&records))
	require.Equal(t, 1, records, "the violation itself is kept")

	_, err = platformSvc.SetFlag(ctx, fx.tenantID, string(platformdomain.ModuleDiscipline), true)
	require.NoError(t, err)
	points, _, err = mentoring.StudentPoints(ctx, fx.tenantID, student)
	require.NoError(t, err)
	require.Equal(t, 60, points, "back on: the figures return")
}

// TestPermitsQueuesCountZeroWhilePermitsIsOff covers the admin dashboard's
// pending-approval counts: an open late arrival counts while permits is on
// and nothing counts while it is off.
func TestPermitsQueuesCountZeroWhilePermitsIsOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte("01234567890123456789012345678901"), ""),
	})
	pending := AnalyticsPermits{Svc: permitsModule.Service, Flags: platformSvc}

	fx := seedGradeLevelFixture(t, pg.AdminPool)
	student := enrolledStudent(t, pg.AdminPool, fx)
	dutyTeacher := enrolledStudent(t, pg.AdminPool, fx)
	token, err := permitsModule.Service.IssueScanToken(ctx, permitsservice.IssueScanTokenInput{
		TenantID: fx.tenantID, Purpose: permitsdomain.PurposeLateArrival, IssuedByUserID: dutyTeacher,
	})
	require.NoError(t, err)
	_, err = permitsModule.Service.OpenLateArrival(ctx, permitsservice.OpenLateArrivalInput{
		TenantID: fx.tenantID, StudentUserID: student, RawToken: token.RawValue,
	})
	require.NoError(t, err)

	count, err := pending.PendingCount(ctx, fx.tenantID, string(permitsdomain.KindLateArrival))
	require.NoError(t, err)
	require.Equal(t, 1, count)

	_, err = platformSvc.SetFlag(ctx, fx.tenantID, string(platformdomain.ModulePermits), false)
	require.NoError(t, err)
	count, err = pending.PendingCount(ctx, fx.tenantID, string(permitsdomain.KindLateArrival))
	require.NoError(t, err)
	require.Zero(t, count)
}
