// Package activities wires the activities module: extracurricular clubs
// and membership, meeting attendance, one-off school activities with
// participants, and student achievements.
package activities

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type Dependencies struct {
	Pool  *pgxpool.Pool
	Years service.AcademicYearReader
	Clock clock.Clock
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.ActivitiesHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Pool, repository.New(deps.Pool), deps.Years, deps.Clock)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
