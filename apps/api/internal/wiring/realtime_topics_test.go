package wiring

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// publishedTopic is one (module, event type, topic kind, slug) tuple the
// realtime work in docs/analysis/realtime-plan-2026-09-25.md section 4
// (chunks C1-C4) publishes a live event to. classScoped marks a duty
// topic that also carries a classID (homeroom is class-scoped; every
// other duty here is tenant-wide) -- the class id itself is never
// validated here, since chunk B's subscribe authorization treats it as an
// opaque scope, not a slug.
//
// This table is kept in sync BY HAND with the actual publish call sites:
// permits/service/realtime.go's dutySlugForStage and every
// publishToDutyStage/publishToUserTopic call in exitpermit.go/
// latearrival.go/leaverequest.go; attendance/service/entries.go's
// SaveEntries; staffattendance/service/records.go's Scan; library/
// service/reservations.go's Reserve and realtime.go's
// publishReservationEvent; visitors/service/visits.go's
// publishBoardEvent/visitorBoardRoles. User topics
// ("user:<tenant>:<userID>", e.g. the exit-permit/leave-request requester
// and grading.published's per-student push) are not listed: any
// authenticated user always owns their own topic, so there is no slug to
// validate.
//
// This is the regression test for the review finding "topics no
// subscriber can ever hold, so those events are never delivered": a made-
// up duty slug ("duty_teacher" instead of the real duty_types.slug
// "picket"), a role that does not exist ("hr"), and a topic kind chunk B's
// subscribe authorization never accepts at all ("tenant:<tenant>:
// visitor-board", parsed by neither "user:"/"role:"/"duty:" in
// internal/platform/realtime/subscribe.go's parseTopic).
type publishedTopic struct {
	module      string
	eventType   string
	kind        string // "role" or "duty"
	slug        string
	classScoped bool
}

var publishedTopics = []publishedTopic{
	// permits (C1) -- apps/api/internal/modules/permits/service/*.go
	{"permits", "late_arrival.opened", "duty", "picket", false},
	{"permits", "late_arrival.updated", "duty", "picket", false},
	{"permits", "exit_permit.stage_changed", "duty", "picket", false},
	{"permits", "exit_permit.stage_changed", "duty", "counselor", false},
	{"permits", "exit_permit.stage_changed", "duty", "leadership", false},
	{"permits", "exit_permit.issued", "duty", "security", false},
	{"permits", "exit_permit.gate_ready", "duty", "security", false},
	{"permits", "exit_permit.exited", "duty", "security", false},
	{"permits", "leave_request.submitted", "duty", "homeroom", true},
	{"permits", "leave_request.reviewed", "duty", "counselor", false},

	// attendance (C2) -- apps/api/internal/modules/attendance/service/entries.go
	{"attendance", "attendance.submitted", "role", "admin", false},
	{"attendance", "attendance.submitted", "role", "principal", false},

	// staffattendance (C2) -- apps/api/internal/modules/staffattendance/service/records.go
	{"staffattendance", "staff_attendance.scanned", "role", "admin", false},
	{"staffattendance", "staff_attendance.scanned", "role", "principal", false},

	// library (C3) -- apps/api/internal/modules/library/service/*.go
	{"library", "library.reserved", "role", "librarian", false},
	{"library", "library.reservation_ready", "role", "librarian", false},

	// visitors (C3) -- apps/api/internal/modules/visitors/service/visits.go
	{"visitors", "visitor.checked_in", "role", "staff", false},
	{"visitors", "visitor.checked_in", "role", "principal", false},
	{"visitors", "visitor.checked_in", "role", "admin", false},
	{"visitors", "visitor.checked_out", "role", "staff", false},
	{"visitors", "visitor.checked_out", "role", "principal", false},
	{"visitors", "visitor.checked_out", "role", "admin", false},
}

// TestRealtimeTopicsUseKnownDefaultRolesAndDuties enumerates every
// role/duty topic C1-C4 publishes to (publishedTopics above) and asserts
// each slug is a real default from authz.RoleDefaults/DutyTypeDefaults --
// the exact set chunk B's subscribe authorization checks a connection's
// claims.Roles against (categoryRole) or a live DutyLookup against
// (categoryDuty, internal/platform/realtime/subscribe.go's authorize).
// A slug this codebase invented (not seeded anywhere) means no default
// user or duty holder could ever subscribe, so the event is published
// into a topic nobody can hold -- silently undeliverable forever.
func TestRealtimeTopicsUseKnownDefaultRolesAndDuties(t *testing.T) {
	knownRoles := make(map[string]bool)
	for _, r := range authz.RoleDefaults() {
		knownRoles[r.Slug] = true
	}
	knownDuties := make(map[string]bool)
	for _, d := range authz.DutyTypeDefaults() {
		knownDuties[d.Slug] = true
	}
	require.NotEmpty(t, knownRoles)
	require.NotEmpty(t, knownDuties)

	require.NotEmpty(t, publishedTopics, "the catalog itself must not be empty, or this test would vacuously pass")

	for _, tp := range publishedTopics {
		t.Run(tp.module+"/"+tp.eventType+"/"+tp.kind+":"+tp.slug, func(t *testing.T) {
			switch tp.kind {
			case "role":
				require.True(t, knownRoles[tp.slug],
					"role %q (%s/%s) is not a default from authz.RoleDefaults -- no user could ever hold it by default, so this topic is never subscribable",
					tp.slug, tp.module, tp.eventType)
			case "duty":
				require.True(t, knownDuties[tp.slug],
					"duty %q (%s/%s) is not a default from authz.DutyTypeDefaults -- no duty_assignment could ever be seeded with it by default, so this topic is never subscribable",
					tp.slug, tp.module, tp.eventType)
			default:
				t.Fatalf("topic kind %q is neither \"role\" nor \"duty\" -- chunk B's subscribe authorization (internal/platform/realtime/subscribe.go) only recognizes user:/role:/duty: topics", tp.kind)
			}
		})
	}
}
