// Package staffattendance wires the module's repository, service, and
// HTTP transport together. It covers the working attendance of teachers
// and staff (arrival, departure, lateness, monthly recap), a different
// concern from the attendance module's per-lesson teaching attendance --
// see docs/12-roadmap.md Fase 6, "absensi pegawai".
package staffattendance

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

type Module struct {
	Service *service.Service
	Handler *transporthttp.StaffAttendanceHandler
}

// Dependencies is everything Register needs from other modules, per
// docs/03-layered-architecture.md section 1's "Interface yang diekspor
// modul, disuntik saat wiring": Years and Calendar reach the academic
// module's active-year and school-calendar reads, Leave reaches permits'
// issued leave requests. Both are supplied by adapters in
// internal/wiring, never by importing those modules directly.
type Dependencies struct {
	Pool     *pgxpool.Pool
	Years    service.AcademicYearReader
	Calendar service.CalendarReader
	Leave    service.LeaveReader
	// Letterhead loads a tenant's configured kop laporan for the
	// recap.export reportdoc exports; nil is fine (those exports just
	// never show one).
	Letterhead reportdoc.LetterheadSource
}

func Register(deps Dependencies) *Module {
	repo := repository.New(deps.Pool)
	svc := service.New(deps.Pool, repo, deps.Years, deps.Calendar, deps.Leave, deps.Letterhead)
	handler := transporthttp.New(svc)
	return &Module{Service: svc, Handler: handler}
}
