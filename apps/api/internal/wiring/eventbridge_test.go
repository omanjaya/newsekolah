package wiring

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// fakeDutyLookup answers UsersWithDuty from a fixed table, keyed by
// (slug, classID), ignoring tenantID (every test case here uses one
// tenant).
type fakeDutyLookup struct {
	holders map[string][]uuid.UUID
}

func (f fakeDutyLookup) UsersWithDuty(_ context.Context, _ uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error) {
	key := slug
	if classID.Valid {
		key += ":" + classID.UUID.String()
	}
	return f.holders[key], nil
}

// TestAttendanceSubmittedBridge_DoesNotPanic is the regression test for a
// real bug: attendance/module.go's busPublisher used to wrap
// attendanceservice.Submitted into an events.Envelope before publishing
// it, so it would satisfy notifications/service/events.go's generic
// Envelope-consuming subscriber (also registered under the same
// "attendance.submitted" name at the time). That broke THIS package's own
// bridge subscriber below, which did (and still does)
// `evt.(attendanceservice.Submitted)` -- an unsafe type assertion that
// panicked on every single attendance submission in any tenant with an
// events.Bus wired (i.e. every real deployment), rolling back the save
// (docs/03-layered-architecture.md section 2: the panic unwinds through
// database.WithTenantTx's deferred rollback before the HTTP Recoverer
// middleware catches it) and showing the teacher a generic "an error
// occurred" with no indication attendance itself never saved.
//
// The fix decouples the two names (service/events.go's EventName()
// doc comment has the full explanation) so this bridge's subscriber
// receives the raw struct it expects, and republishes a *different*,
// correctly-addressed events.Envelope that the notifications bridge's own
// spy handler below (standing in for notifications/service/events.go's
// real one) receives safely.
func TestAttendanceSubmittedBridge_DoesNotPanic(t *testing.T) {
	tenantID := uuid.New()
	classID := uuid.New()
	homeroomTeacherID := uuid.New()
	submitterID := uuid.New() // a substitute, distinct from the homeroom teacher
	sessionID := uuid.New()

	bus := events.NewBus()
	duties := fakeDutyLookup{holders: map[string][]uuid.UUID{
		"homeroom:" + classID.String(): {homeroomTeacherID},
	}}
	RegisterNotificationBridge(bus, duties, slog.Default())

	// Stands in for notifications/service/events.go's real
	// eventMappings[events.AttendanceSubmitted] subscriber: captures
	// whatever events.Envelope actually reaches the notification-facing
	// name, the same way the real one does.
	var received *events.Envelope
	bus.Subscribe(events.AttendanceSubmitted, func(_ context.Context, evt events.Event) error {
		envelope, ok := evt.(events.Envelope)
		require.True(t, ok, "notification-facing subscriber must receive an events.Envelope, got %T", evt)
		e := envelope
		received = &e
		return nil
	})

	require.NotPanics(t, func() {
		err := bus.Publish(context.Background(), attendanceservice.Submitted{
			TenantID: tenantID, SessionID: sessionID, ClassID: classID,
			Date: time.Now(), SubmittedBy: submitterID, StudentCount: 20,
		})
		require.NoError(t, err)
	})

	require.NotNil(t, received, "the homeroom teacher's notification envelope was never published")
	require.Equal(t, events.AttendanceSubmitted, received.Name)
	require.Equal(t, tenantID, received.Tenant)
	require.Equal(t, submitterID, received.Actor)
	require.Equal(t, []uuid.UUID{homeroomTeacherID}, received.Subject)
	require.Equal(t, sessionID.String(), received.Payload["session_id"])
}

// TestAttendanceSubmittedBridge_SubmitterIsSoleHomeroom covers the other
// real case: a class's own homeroom teacher submitting their own
// attendance -- the common case, not the exception this test's sibling
// above uses a substitute to exercise. No one is left to notify, so the
// bridge must not publish (or panic).
func TestAttendanceSubmittedBridge_SubmitterIsSoleHomeroom(t *testing.T) {
	tenantID := uuid.New()
	classID := uuid.New()
	homeroomTeacherID := uuid.New()

	bus := events.NewBus()
	duties := fakeDutyLookup{holders: map[string][]uuid.UUID{
		"homeroom:" + classID.String(): {homeroomTeacherID},
	}}
	RegisterNotificationBridge(bus, duties, slog.Default())

	published := false
	bus.Subscribe(events.AttendanceSubmitted, func(context.Context, events.Event) error {
		published = true
		return nil
	})

	require.NotPanics(t, func() {
		err := bus.Publish(context.Background(), attendanceservice.Submitted{
			TenantID: tenantID, SessionID: uuid.New(), ClassID: classID,
			Date: time.Now(), SubmittedBy: homeroomTeacherID, StudentCount: 20,
		})
		require.NoError(t, err)
	})
	require.False(t, published, "no notification should be published when the submitter is the only recipient")
}
