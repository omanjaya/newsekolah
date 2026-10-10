package wiring

import (
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
)

// RetentionPolicy maps the validated retention settings in config onto the
// platform module's maintenance policy.
func RetentionPolicy(cfg config.Config) platformservice.RetentionPolicy {
	return platformservice.RetentionPolicy{
		AuditLogMonths:      cfg.AuditLogRetentionMonths,
		LoginAttemptDays:    cfg.LoginAttemptRetentionDays,
		WebhookDeliveryDays: cfg.WebhookDeliveryRetentionDays,
	}
}
