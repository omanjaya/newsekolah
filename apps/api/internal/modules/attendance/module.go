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
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/transport/http"
)

// Module is deliberately thin today: the attendance module's domain rules,
// service, and repository are not built yet in this worktree (see
// internal/modules/attendance/transport/http/handler.go), so Register only
// wires the honest-501 transport layer cmd/api needs to satisfy
// api.StrictServerInterface.
type Module struct {
	Handler *transporthttp.AttendanceHandler
}

func Register() *Module {
	return &Module{Handler: transporthttp.New()}
}
