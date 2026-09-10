// Package mentoring wires the mentoring module: mentor groups bounded by a
// tenant group-size limit, encrypted meeting notes restricted to the
// mentor/counselor/leadership, the mentor's per-student view composed from
// other modules, and per-term summaries.
package mentoring

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
)

type Dependencies struct {
	Pool       *pgxpool.Pool
	Years      service.AcademicYearReader
	Attendance service.AttendanceReader
	Discipline service.DisciplineReader
	Grading    service.GradingReader
	Flags      service.FlagChecker
	Sealer     *crypto.Sealer
	Clock      clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.MentoringHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Attendance, deps.Discipline, deps.Grading, deps.Flags, deps.Sealer, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
