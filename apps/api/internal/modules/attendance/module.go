// Package attendance wires the module's repository, service, and HTTP
// transport together, and declares the two extension points the
// not-yet-merged permits module will implement: Blocker (an unfinished
// late-arrival workflow should stop a student from being marked present)
// and Overrider (an issued leave letter or exit permit forces a student's
// status for a date). Both default to a no-op so attendance is fully
// functional before permits exists, per docs/03-layered-architecture.md
// section 1's "Interface yang diekspor modul" pattern.
package attendance

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Module struct {
	Service *service.Service
	Handler *transporthttp.AttendanceHandler
}

// busPublisher adapts the platform-wide event bus to
// attendance/service.EventPublisher, mirroring scheduling/module.go's
// identically-named adapter: the two packages declare structurally
// identical but distinct Event interfaces, so a plain type assignment
// cannot satisfy service.EventPublisher directly.
type busPublisher struct{ bus *events.Bus }

// Publish wraps service.Submitted into the events.Envelope shape
// notifications/service/events.go's subscriber requires (a bare struct
// satisfying service.Event fails its type assertion to events.Envelope, so
// the subscriber's handler always errored and notifications for a
// submitted session never fired). Subject is left empty now that a
// submitted session no longer has any parent/guardian account to notify;
// notifications' handler treats an empty Subject as a no-op.
func (p busPublisher) Publish(ctx context.Context, evt service.Event) error {
	submitted, ok := evt.(service.Submitted)
	if !ok {
		return p.bus.Publish(ctx, evt)
	}
	return p.bus.Publish(ctx, events.Envelope{
		Name: submitted.EventName(), Tenant: submitted.TenantID, Actor: submitted.SubmittedBy,
		Payload: map[string]any{
			"session_id": submitted.SessionID.String(), "class_id": submitted.ClassID.String(),
			"date": submitted.Date.Format("2006-01-02"), "student_count": submitted.StudentCount,
		},
	})
}

// hubPublisher adapts platform/realtime's Hub to
// attendance/service.RealtimePublisher, owning the "monitor:<tenantID>"
// topic-naming convention cmd/api/ws.go's wsMonitorHandler also uses.
type hubPublisher struct{ hub *realtime.Hub }

func (p hubPublisher) PublishMonitor(tenantID uuid.UUID, event any) error {
	return p.hub.Publish("monitor:"+tenantID.String(), event)
}

// hubPresence is the fallback PresenceReader ("hub connection counts")
// used when no realtime.Presence tracker is wired in. This simply counts
// open sockets on the tenant's monitor topic; it has no per-role
// attribution to report.
type hubPresence struct{ hub *realtime.Hub }

func (p hubPresence) Snapshot(tenantID uuid.UUID) (int, []string) {
	n := p.hub.TopicSize("monitor:" + tenantID.String())
	if n == 0 {
		return 0, nil
	}
	return n, []string{"monitor"}
}

// livePresence adapts platform/realtime's Presence tracker (fed by every
// GET /ws/me connection's heartbeat, see cmd/api/ws.go) to
// service.PresenceReader. Presence has no notion of tenant, so every key
// carries "<tenantID>:<role>:<userID>" (see wsMeHandler), and Snapshot here
// filters to tenantID's prefix and strips it back off before returning --
// the "<role>:<userID>" remainder is what GetMonitorPresence parses for
// its per-role counts.
type livePresence struct{ presence *realtime.Presence }

func (p livePresence) Snapshot(tenantID uuid.UUID) (int, []string) {
	prefix := tenantID.String() + ":"
	all := p.presence.Snapshot(context.Background(), time.Now())
	out := make([]string, 0, len(all))
	for _, key := range all {
		if rest, ok := strings.CutPrefix(key, prefix); ok {
			out = append(out, rest)
		}
	}
	return len(out), out
}

// Dependencies is everything Register needs from other modules and
// platform packages, per docs/03-layered-architecture.md section 1's
// "Interface yang diekspor modul, disuntik saat wiring".
type Dependencies struct {
	Pool      *pgxpool.Pool
	Bus       *events.Bus
	Years     service.AcademicYearReader
	Schedules scheduling.ScheduleReader
	Access    scheduling.AccessChecker
	Journals  scheduling.JournalService
	Perms     authz.PermissionsProvider
	Hub       *realtime.Hub
	// Presence is optional: when set, GetMonitorPresence reports real
	// per-user/per-role heartbeats from GET /ws/me instead of falling
	// back to a plain monitor-topic socket count.
	Presence *realtime.Presence
	// Blocker, Overrider, Violations and Discipline are optional; permits
	// and discipline supply them after wiring.
	Blocker    Blocker
	Overrider  Overrider
	Violations ViolationRecorder
	Discipline DisciplineReader
	// Letterheads is optional: the school module's tenant letterhead/
	// default signature reader (wiring.ReportHeaderReports), for the
	// report exports' Document.Letterhead/Signature. Nil renders every
	// export without a letterhead, same as before reportdoc existed.
	Letterheads reportdoc.LetterheadSource
}

func Register(deps Dependencies) *Module {
	repo := repository.New(deps.Pool)
	var blocker Blocker = NoOpBlocker{}
	if deps.Blocker != nil {
		blocker = deps.Blocker
	}
	var overrider Overrider = NoOpOverrider{}
	if deps.Overrider != nil {
		overrider = deps.Overrider
	}
	var violations ViolationRecorder = NoOpViolationRecorder{}
	if deps.Violations != nil {
		violations = deps.Violations
	}
	var discipline DisciplineReader = NoOpDisciplineReader{}
	if deps.Discipline != nil {
		discipline = deps.Discipline
	}
	var presence service.PresenceReader = hubPresence{hub: deps.Hub}
	if deps.Presence != nil {
		presence = livePresence{presence: deps.Presence}
	}
	svc := service.New(
		deps.Pool, repo, deps.Years, deps.Schedules, deps.Access, deps.Journals,
		blocker, overrider, violations, discipline,
		busPublisher{bus: deps.Bus}, hubPublisher{hub: deps.Hub}, presence,
	)
	if deps.Letterheads != nil {
		svc.SetLetterheadSource(deps.Letterheads)
	}
	handler := transporthttp.New(svc, deps.Perms)

	return &Module{Service: svc, Handler: handler}
}
