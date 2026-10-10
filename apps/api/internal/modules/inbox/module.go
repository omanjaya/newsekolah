// Package inbox wires the action-inbox badge: one cheap read that sums what
// the caller can act on across the permits and discipline modules. It owns
// no tables; every number comes from the owning module's own count port.
package inbox

import (
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/inbox/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/inbox/transport/http"
)

type Dependencies struct {
	Perms          service.PermissionReader
	Leave          service.LeaveCounter
	Exit           service.ExitCounter
	Late           service.LateCounter
	WarningLetters service.WarningLetterCounter
}

type Module struct {
	Service *service.Service
	Handler *transporthttp.InboxHandler
}

func Register(deps Dependencies) *Module {
	svc := service.New(deps.Perms, deps.Leave, deps.Exit, deps.Late, deps.WarningLetters)
	return &Module{Service: svc, Handler: transporthttp.New(svc)}
}
