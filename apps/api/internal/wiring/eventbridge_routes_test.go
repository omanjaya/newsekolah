package wiring

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// anyoneHolds answers every duty lookup with one fixed holder, so every
// envelope the bridge can produce has a recipient.
type anyoneHolds struct{ holder uuid.UUID }

func (a anyoneHolds) UsersWithDuty(context.Context, uuid.UUID, string, uuid.NullUUID) ([]uuid.UUID, error) {
	return []uuid.UUID{a.holder}, nil
}

// webAppRoutes is the web app's signed-in route tree (Next.js app router),
// relative to this package.
const webAppRoutes = "../../../web/app/(app)"

// routeExists reports whether href (path only) names a page of the web
// app: each segment is a directory of that name or a single dynamic
// segment ("[id]"), and the last one holds a page.tsx.
func routeExists(t *testing.T, href string) bool {
	t.Helper()
	dir := webAppRoutes
	for _, segment := range strings.Split(strings.Trim(strings.SplitN(href, "?", 2)[0], "/"), "/") {
		if segment == "" {
			continue
		}
		if info, err := os.Stat(filepath.Join(dir, segment)); err == nil && info.IsDir() {
			dir = filepath.Join(dir, segment)
			continue
		}
		entries, err := os.ReadDir(dir)
		require.NoError(t, err)
		next := ""
		for _, entry := range entries {
			name := entry.Name()
			if entry.IsDir() && strings.HasPrefix(name, "[") && !strings.HasPrefix(name, "[...") {
				next = filepath.Join(dir, name)
				break
			}
		}
		if next == "" {
			return false
		}
		dir = next
	}
	_, err := os.Stat(filepath.Join(dir, "page.tsx"))
	return err == nil
}

// TestNotificationLinksOpenExistingPages is the regression test for
// notifications that opened a 404 (/exit-permits/{id}, /late-arrivals/{id}
// and /discipline/letters/{id} had no page): every link the bridge puts on
// a notification must be a page of the web app.
func TestNotificationLinksOpenExistingPages(t *testing.T) {
	if _, err := os.Stat(webAppRoutes); err != nil {
		t.Skip("web app sources not present next to the API")
	}
	bus := events.NewBus()
	RegisterNotificationBridge(bus, anyoneHolds{holder: uuid.New()}, slog.Default())

	hrefs := map[string]string{}
	for _, name := range []string{
		events.AttendanceSubmitted, events.SubstitutionRequested, events.SubstitutionResponded,
		events.LeaveRequestSubmitted, events.LeaveRequestReviewed, events.LeaveRequestIssued,
		events.ExitPermitStageChanged, events.ExitPermitIssued, events.ExitPermitExited,
		events.LateArrivalOpened, events.LateArrivalUpdated, events.WarningLetterIssued,
		events.DisciplineThresholdReached, events.LibraryReservationReady, events.LibraryLoanDueReminder,
	} {
		bus.Subscribe(name, func(_ context.Context, evt events.Event) error {
			if envelope, ok := evt.(events.Envelope); ok {
				href, _ := envelope.Payload["href"].(string)
				hrefs[envelope.Name+" "+href] = href
			}
			return nil
		})
	}

	// Substitution, library and threshold events share their name with the envelope
	// the bridge republishes, so they are published here as envelopes
	// already (scheduling's busPublisher); their links are fixed pages.
	tenant, student, other := uuid.New(), uuid.New(), uuid.New()
	class := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	for _, evt := range []events.Event{
		attendanceservice.Submitted{TenantID: tenant, SessionID: uuid.New(), ClassID: class.UUID, Date: time.Now(), SubmittedBy: other, StudentCount: 1},
		permitsservice.LeaveRequestSubmitted{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, ClassID: class},
		permitsservice.LeaveRequestReviewed{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, Approved: true, ReviewerID: other},
		permitsservice.LeaveRequestIssued{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, LetterNumber: "1/IZIN"},
		permitsservice.ExitPermitStageChanged{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, StageKey: "bk"},
		permitsservice.ExitPermitIssued{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student},
		permitsservice.ExitPermitExited{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, SecurityUserID: other},
		permitsservice.LateArrivalOpened{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, ClassID: class},
		permitsservice.LateArrivalUpdated{TenantID: tenant, InstanceID: uuid.New(), StudentUserID: student, Status: "completed"},
		disciplineservice.WarningLetterIssued{TenantID: tenant, LetterID: uuid.New(), StudentUserID: student, ClassID: class, Level: 1, LevelLabel: "SP1", LetterNumber: "1/SP", IssuedBy: other},
	} {
		require.NoError(t, bus.Publish(context.Background(), evt))
	}

	require.NotEmpty(t, hrefs)
	for key, href := range hrefs {
		require.NotEmpty(t, href, "%s carries no link", key)
		require.True(t, routeExists(t, href), "%s links to %s, which is not a page of the web app", key, href)
	}
}

// TestExitPermitIssuedTellsEachRecipientTheirPart covers the guard being
// sent the student's "show the QR at the gate" text.
func TestExitPermitIssuedTellsEachRecipientTheirPart(t *testing.T) {
	bus := events.NewBus()
	guard := uuid.New()
	RegisterNotificationBridge(bus, anyoneHolds{holder: guard}, slog.Default())
	bySubject := map[uuid.UUID]string{}
	bus.Subscribe(events.ExitPermitIssued, func(_ context.Context, evt events.Event) error {
		envelope := evt.(events.Envelope)
		for _, id := range envelope.Subject {
			bySubject[id], _ = envelope.Payload["summary"].(string)
		}
		return nil
	})

	student := uuid.New()
	require.NoError(t, bus.Publish(context.Background(), permitsservice.ExitPermitIssued{TenantID: uuid.New(), InstanceID: uuid.New(), StudentUserID: student}))

	require.Contains(t, bySubject[student], "Tunjukkan QR")
	require.NotContains(t, bySubject[guard], "Tunjukkan QR")
	require.Contains(t, bySubject[guard], "diverifikasi di gerbang")
}

// TestLeaveRequestReviewedQuotesTheReviewersNote covers a rejection whose
// reason the student never saw.
func TestLeaveRequestReviewedQuotesTheReviewersNote(t *testing.T) {
	bus := events.NewBus()
	RegisterNotificationBridge(bus, anyoneHolds{holder: uuid.New()}, slog.Default())
	var summary string
	bus.Subscribe(events.LeaveRequestReviewed, func(_ context.Context, evt events.Event) error {
		summary, _ = evt.(events.Envelope).Payload["summary"].(string)
		return nil
	})

	require.NoError(t, bus.Publish(context.Background(), permitsservice.LeaveRequestReviewed{
		TenantID: uuid.New(), InstanceID: uuid.New(), StudentUserID: uuid.New(), ReviewerID: uuid.New(),
		Approved: false, Note: "  Ada ulangan Matematika pada tanggal itu.  ",
	}))
	require.Equal(t, "Pengajuan izin Anda ditolak. Alasan: Ada ulangan Matematika pada tanggal itu.", summary)

	require.NoError(t, bus.Publish(context.Background(), permitsservice.LeaveRequestReviewed{
		TenantID: uuid.New(), InstanceID: uuid.New(), StudentUserID: uuid.New(), ReviewerID: uuid.New(),
		Approved: false, Note: strings.Repeat("a", 300),
	}))
	require.Len(t, []rune(summary), len([]rune("Pengajuan izin Anda ditolak. Alasan: "))+reviewNoteMaxRunes+3)
}
