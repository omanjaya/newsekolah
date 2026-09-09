package authz

// PermPublishAnnouncements gates the publish/schedule/archive workflow
// actions on an announcement, distinct from PermCreateAnnouncements and
// PermEditAnnouncements: publishing fans out a notification to every
// resolved recipient (docs/04-clean-code.md section 6 calls out workflow
// actions as their own sub-resource verb, not a generic edit), so it is
// deliberately a separate, more sensitive permission.
const PermPublishAnnouncements = "publish_announcements"

func init() {
	Catalog = append(Catalog, Permission{
		PermPublishAnnouncements, "announcements", "Publish, schedule, or archive an announcement",
	})
}
