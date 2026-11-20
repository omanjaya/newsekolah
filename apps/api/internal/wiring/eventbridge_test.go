package wiring

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	libraryservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	schedulingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
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

// spyEnvelopes records every events.Envelope published under the given
// notification-facing names, standing in for notifications/service's
// subscribers (registered after the bridge, as cmd/api/wire.go does).
func spyEnvelopes(t *testing.T, bus *events.Bus, names ...string) *[]events.Envelope {
	t.Helper()
	got := &[]events.Envelope{}
	for _, name := range names {
		bus.Subscribe(name, func(_ context.Context, evt events.Event) error {
			envelope, ok := evt.(events.Envelope)
			require.True(t, ok, "notification-facing subscriber must receive an events.Envelope, got %T", evt)
			*got = append(*got, envelope)
			return nil
		})
	}
	return got
}

// TestSubstitutionBridge_NotifiesWithoutPanic is the regression test for
// the substitution 500s: the scheduling module's typed events used to share
// their name with the notification Envelope, so the bridge received an
// Envelope, panicked on its type assertion after the request had committed,
// and no notification was ever written.
func TestSubstitutionBridge_NotifiesWithoutPanic(t *testing.T) {
	tenantID := uuid.New()
	requester := uuid.New()
	substitute := uuid.New()
	substitutionID := uuid.New()
	date := time.Date(2026, 12, 2, 0, 0, 0, 0, time.UTC)

	bus := events.NewBus()
	RegisterNotificationBridge(bus, fakeDutyLookup{}, slog.Default())
	got := spyEnvelopes(t, bus, events.SubstitutionRequested, events.SubstitutionResponded)

	require.NotPanics(t, func() {
		require.NoError(t, bus.Publish(context.Background(), schedulingservice.SubstitutionRequested{
			TenantID: tenantID, SubstitutionID: substitutionID, ScheduleID: uuid.New(), Date: date,
			RequesterUserID: requester, SubstituteUserID: substitute,
		}))
		require.NoError(t, bus.Publish(context.Background(), schedulingservice.SubstitutionResponded{
			TenantID: tenantID, SubstitutionID: substitutionID, ScheduleID: uuid.New(), Date: date,
			RequesterUserID: requester, SubstituteUserID: substitute, Accepted: true,
		}))
	})

	require.Len(t, *got, 2)
	require.Equal(t, events.SubstitutionRequested, (*got)[0].Name)
	require.Equal(t, []uuid.UUID{substitute}, (*got)[0].Subject)
	require.Equal(t, "2026-12-02", (*got)[0].Payload["date"])
	require.Equal(t, events.SubstitutionResponded, (*got)[1].Name)
	require.Equal(t, []uuid.UUID{requester}, (*got)[1].Subject)
	require.Equal(t, true, (*got)[1].Payload["accepted"])
}

// TestBridge_IgnoresEnvelopeUnderTypedName keeps a future name collision a
// no-op instead of a panic: an Envelope arriving under a typed event's name
// is skipped.
func TestBridge_IgnoresEnvelopeUnderTypedName(t *testing.T) {
	bus := events.NewBus()
	RegisterNotificationBridge(bus, fakeDutyLookup{}, slog.Default())
	require.NotPanics(t, func() {
		require.NoError(t, bus.Publish(context.Background(), events.Envelope{
			Name: schedulingservice.SubstitutionRequested{}.EventName(), Tenant: uuid.New(), Subject: []uuid.UUID{uuid.New()},
		}))
	})
}

// TestBridge_TypedNamesNeverCollideWithEnvelopeNames guards the naming
// rule every bridged event follows: a typed module event sharing a name
// with a notification Envelope routes the bridge's output back into it.
func TestBridge_TypedNamesNeverCollideWithEnvelopeNames(t *testing.T) {
	envelopeNames := map[string]bool{
		events.AttendanceSubmitted: true, events.SubstitutionRequested: true, events.SubstitutionResponded: true,
		events.LeaveRequestSubmitted: true, events.LeaveRequestReviewed: true, events.LeaveRequestIssued: true,
		events.ExitPermitStageChanged: true, events.ExitPermitIssued: true, events.ExitPermitExited: true,
		events.LateArrivalOpened: true, events.LateArrivalUpdated: true, events.WarningLetterIssued: true,
		events.DisciplineThresholdReached: true, events.AnnouncementPublished: true,
		events.LibraryReservationReady: true, events.LibraryLoanDueReminder: true,
	}
	typed := []events.Event{
		attendanceservice.Submitted{},
		schedulingservice.SubstitutionRequested{}, schedulingservice.SubstitutionResponded{},
		disciplineservice.ThresholdReached{}, disciplineservice.WarningLetterIssued{},
		libraryservice.ReservationReadyEvent{}, libraryservice.LoanDueReminderEvent{},
		permitsservice.LeaveRequestSubmitted{}, permitsservice.LeaveRequestReviewed{}, permitsservice.LeaveRequestIssued{},
		permitsservice.ExitPermitStageChanged{}, permitsservice.ExitPermitIssued{}, permitsservice.ExitPermitExited{},
		permitsservice.LateArrivalOpened{}, permitsservice.LateArrivalUpdated{},
	}
	for _, evt := range typed {
		require.False(t, envelopeNames[evt.EventName()], "%T uses the notification Envelope name %q", evt, evt.EventName())
	}
}

// TestBridge_ThresholdAndLibraryEventsDoNotPanic covers the other events
// that shared their Envelope name (seen panicking in the API log, the
// reservation one inside a loan-return transaction).
func TestBridge_ThresholdAndLibraryEventsDoNotPanic(t *testing.T) {
	tenantID := uuid.New()
	counselor := uuid.New()
	member := uuid.New()
	bus := events.NewBus()
	RegisterNotificationBridge(bus, fakeDutyLookup{holders: map[string][]uuid.UUID{"counselor": {counselor}}}, slog.Default())
	got := spyEnvelopes(t, bus, events.DisciplineThresholdReached, events.LibraryReservationReady, events.LibraryLoanDueReminder)

	require.NotPanics(t, func() {
		require.NoError(t, bus.Publish(context.Background(), disciplineservice.ThresholdReached{
			TenantID: tenantID, StudentUserID: uuid.New(), Level: 1, LevelLabel: "SP 1", TotalPoints: 50,
		}))
		require.NoError(t, bus.Publish(context.Background(), libraryservice.ReservationReadyEvent{
			TenantID: tenantID, ReservationID: uuid.New(), TitleID: uuid.New(), MemberUserID: member,
		}))
		require.NoError(t, bus.Publish(context.Background(), libraryservice.LoanDueReminderEvent{
			TenantID: tenantID, MemberUserID: member, LoanCount: 2,
		}))
	})
	require.Len(t, *got, 3)
	require.Equal(t, []uuid.UUID{counselor}, (*got)[0].Subject)
	require.Equal(t, []uuid.UUID{member}, (*got)[1].Subject)
	require.Equal(t, []uuid.UUID{member}, (*got)[2].Subject)
}
