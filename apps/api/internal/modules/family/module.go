// Package family wires the parent view: read-only access to a linked
// child's attendance, grades and discipline.
package family

import (
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/family/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/family/transport/http"
)

type Dependencies struct {
	Links      service.LinkChecker
	Attendance service.AttendanceReader
	Grading    service.GradingReader
	Discipline service.DisciplineReader
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.FamilyHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Links, deps.Attendance, deps.Grading, deps.Discipline)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
