package wiring

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// thresholdHarness wires discipline, the notification bridge and the
// notifications module on one bus, as cmd/api/wire.go does.
type thresholdHarness struct {
	pg         dbtest.Postgres
	bus        *events.Bus
	discipline *discipline.Module
	fx         gradeLevelFixture
	student    uuid.UUID
	counselor  uuid.UUID
	heavyType  uuid.UUID
}

func newThresholdHarness(t *testing.T) thresholdHarness {
	t.Helper()
	pg := dbtest.Start(t)
	bus := events.NewBus()
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	student := enrolledStudent(t, pg.AdminPool, fx)
	counselorRow, err := db.New(pg.AdminPool).CreateUser(context.Background(), db.CreateUserParams{
		TenantID: fx.tenantID, Username: "guru-bk-" + uuid.NewString()[:8], PasswordHash: "x", Name: "Guru BK", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	counselor := counselorRow.ID

	RegisterNotificationBridge(bus, fakeDutyLookup{holders: map[string][]uuid.UUID{"counselor": {counselor}}}, slog.Default())
	notifications.Register(notifications.Dependencies{Pool: pg.AppPool, Bus: bus, Clock: clock.Real{}})
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Bus: bus, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})

	var heavyType uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(context.Background(),
		`insert into violation_types (tenant_id, code, name, points) values ($1, 'BLS', 'Bolos', 30) returning id`,
		fx.tenantID).Scan(&heavyType))
	return thresholdHarness{pg: pg, bus: bus, discipline: disciplineModule, fx: fx, student: student, counselor: counselor, heavyType: heavyType}
}

func (h thresholdHarness) record(t *testing.T) (disciplineservice.RecordResult, error) {
	t.Helper()
	return h.discipline.Service.RecordViolation(context.Background(), h.fx.tenantID, disciplineservice.RecordInput{
		StudentUserID: h.student, ViolationTypeID: h.heavyType, OccurredOn: time.Now(), ReporterUserID: h.counselor,
	})
}

func (h thresholdHarness) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, h.pg.AdminPool.QueryRow(context.Background(), query, args...).Scan(&n))
	return n
}

// TestRecordViolation_CrossingAThresholdSucceedsAndNotifiesOnce is the
// regression test for the SP-threshold 500: the bridge used to panic on
// its own Envelope after the record had committed, so staff saw an error,
// saved again and recorded the violation twice, and the counselor was
// never notified. Crossing a level must now answer success, write exactly
// one record and one counselor notification.
func TestRecordViolation_CrossingAThresholdSucceedsAndNotifiesOnce(t *testing.T) {
	h := newThresholdHarness(t)

	var result disciplineservice.RecordResult
	require.NotPanics(t, func() {
		var err error
		result, err = h.record(t)
		require.NoError(t, err)
	})
	require.Equal(t, 30, result.TotalPoints)
	require.NotEmpty(t, result.DueLevels, "30 points reach the default SP 1 threshold")

	require.Equal(t, 1, h.count(t, `select count(*) from violation_records where tenant_id = $1 and student_user_id = $2`, h.fx.tenantID, h.student))
	require.Equal(t, 1, h.count(t,
		`select count(*) from notifications where tenant_id = $1 and user_id = $2 and kind = 'discipline_threshold_reached'`,
		h.fx.tenantID, h.counselor))
}

// TestRecordViolation_FailingSubscriberNeverFailsTheRecord keeps a broken
// notification path from turning a saved record into an error (or from
// rolling the record back): the subscriber's work is undone on its own
// savepoint while the record commits.
func TestRecordViolation_FailingSubscriberNeverFailsTheRecord(t *testing.T) {
	h := newThresholdHarness(t)
	h.bus.Subscribe(disciplineservice.ThresholdReached{}.EventName(), func(ctx context.Context, _ events.Event) error {
		tx, ok := database.TxFromContext(ctx)
		require.True(t, ok, "the threshold event is published inside the record's transaction")
		_, err := tx.Exec(ctx, "select 1/0")
		require.Error(t, err)
		return errors.New("subscriber failed")
	})
	h.bus.Subscribe(disciplineservice.ThresholdReached{}.EventName(), func(context.Context, events.Event) error {
		panic("subscriber panicked")
	})

	result, err := h.record(t)
	require.NoError(t, err)
	require.Equal(t, 30, result.TotalPoints)
	require.Equal(t, 1, h.count(t, `select count(*) from violation_records where tenant_id = $1 and student_user_id = $2`, h.fx.tenantID, h.student))
}
