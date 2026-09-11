// Package grading wires the grading module: assessment components and
// scores, report scores computed from weighted averages with the school's
// increase ranges, publication to students, and the star ledger.
package grading

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool  *pgxpool.Pool
	Years service.AcademicYearReader
	Perms transporthttp.PermissionChecker // nil: only the assigned teacher may write
	Flags service.FlagReader              // nil: module is always enabled
	Clock clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.GradingHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Flags, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc, deps.Perms)}
}
