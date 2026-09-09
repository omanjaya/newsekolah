package authz

// PermManageNotificationSettings gates tenant-wide notification defaults
// (which channels are enabled by default per kind). Reading and writing a
// user's own preferences, push device registration, and the inbox itself
// need no dedicated permission beyond "authenticated" -- they only ever
// touch the caller's own data (see openapi/modules/notifications.yaml).
const PermManageNotificationSettings = "manage_notification_settings"

func init() {
	Catalog = append(Catalog, Permission{
		PermManageNotificationSettings, "notifications", "Change tenant-wide default notification channels",
	})
}
