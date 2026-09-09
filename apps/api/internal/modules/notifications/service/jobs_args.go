package service

import (
	"time"

	"github.com/google/uuid"
)

// River job argument types. Defined here (not in transport/jobs) because
// the service constructs and enqueues them from Notify/RunDigest/etc, and
// dependency direction only ever runs transport -> service: transport/jobs
// imports these types to declare river.Worker[XArgs] and calls back into
// the Service method that does the actual work.

type DeliverPushArgs struct {
	TenantID              uuid.UUID
	NotificationID        uuid.UUID
	NotificationCreatedAt time.Time
	DeliveryID            uuid.UUID
	DeviceID              uuid.UUID
	Title                 string
	Body                  string
	Href                  string
}

func (DeliverPushArgs) Kind() string { return "notifications.deliver_push" }

type DeliverEmailArgs struct {
	TenantID              uuid.UUID
	NotificationID        uuid.UUID
	NotificationCreatedAt time.Time
	DeliveryID            uuid.UUID
	ToEmail               string
	Title                 string
	Body                  string
	Href                  string
}

func (DeliverEmailArgs) Kind() string { return "notifications.deliver_email" }

type DeliverWhatsAppArgs struct {
	TenantID              uuid.UUID
	NotificationID        uuid.UUID
	NotificationCreatedAt time.Time
	DeliveryID            uuid.UUID
	ToPhone               string
	Message               string
	// TemplateID, MetaTemplateName and Locale identify which approved Meta
	// template this message renders (see domain.WhatsAppTemplate). Zero
	// values mean "no specific template": the worker falls back to the
	// module's default template name/locale, matching this module's
	// pre-template behavior.
	TemplateID       uuid.NullUUID
	MetaTemplateName string
	Locale           string
}

func (DeliverWhatsAppArgs) Kind() string { return "notifications.deliver_whatsapp" }

// RunDigestArgs, PruneDevicesArgs, RunRetentionArgs, and
// EnsurePartitionsArgs carry no payload: each periodic job run processes
// every active tenant, looping one tenant transaction at a time (see
// service.go's Repository.ListActiveTenants).

type RunDigestArgs struct{}

func (RunDigestArgs) Kind() string { return "notifications.run_digest" }

type PruneDevicesArgs struct{}

func (PruneDevicesArgs) Kind() string { return "notifications.prune_devices" }

type RunRetentionArgs struct{}

func (RunRetentionArgs) Kind() string { return "notifications.run_retention" }

type EnsurePartitionsArgs struct{}

func (EnsurePartitionsArgs) Kind() string { return "notifications.ensure_partitions" }
