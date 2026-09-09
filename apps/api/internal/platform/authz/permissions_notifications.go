package authz

// PermManageNotificationSettings gates tenant-wide notification defaults
// (which channels are enabled by default per kind). Reading and writing a
// user's own preferences, push device registration, and the inbox itself
// need no dedicated permission beyond "authenticated" -- they only ever
// touch the caller's own data (see openapi/modules/notifications.yaml).
const PermManageNotificationSettings = "manage_notification_settings"

// PermManageWhatsApp gates the WhatsApp provider configuration, message
// templates, and delivery log/resend -- all tenant-wide administration,
// never a per-user setting.
const PermManageWhatsApp = "manage_whatsapp"

func init() {
	Catalog = append(Catalog, Permission{
		PermManageNotificationSettings, "notifications", "Change tenant-wide default notification channels",
	})
	Catalog = append(Catalog, Permission{
		PermManageWhatsApp, "notifications", "Configure the WhatsApp gateway, templates, and delivery log",
	})
}
