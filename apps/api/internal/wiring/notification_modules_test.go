package wiring

import (
	"testing"

	"github.com/stretchr/testify/require"

	notificationsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// TestNotificationKindModulesAreToggleable keeps the notifications module's
// kind -> module map (named with plain strings so it never imports the
// platform module) in step with the platform's toggleable modules: a module
// name the platform does not know would never be reported as switched off,
// so its notifications would stay visible after the school disabled it.
func TestNotificationKindModulesAreToggleable(t *testing.T) {
	modules := notificationsdomain.NotificationModules()
	require.NotEmpty(t, modules)
	for _, m := range modules {
		require.True(t, platformdomain.Module(m).Valid(), "notification module %q is not in platform AllModules", m)
	}
}
