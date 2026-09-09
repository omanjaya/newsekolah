// Package reports wires the report centre: one catalogue, one export
// endpoint, data supplied by the owning modules through wiring adapters.
package reports

import (
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/transport/http"
)

type Dependencies struct {
	Attendance service.AttendanceReader
	Discipline service.DisciplineReader
	Grading    service.GradingReader
	Permits    service.PermitsReader
	Perms      transporthttp.PermissionChecker
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.ReportsHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Attendance, deps.Discipline, deps.Grading, deps.Permits)
	return &Module{Service: svc, Handler: transporthttp.New(svc, deps.Perms)}
}
