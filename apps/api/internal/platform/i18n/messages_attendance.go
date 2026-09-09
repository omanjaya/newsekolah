package i18n

// init-merge: the attendance module's own message, added to the shared
// catalog without editing internal/platform/i18n/i18n.go (which every
// module touches), mirroring the additive pattern
// internal/platform/authz/permissions_attendance.go already uses for the
// permission catalog. NOT_IMPLEMENTED backs every 501 the attendance
// module's transport layer returns while its service/repository are not
// yet built.
func init() {
	catalog["NOT_IMPLEMENTED"] = map[string]string{
		Indonesian: "Fitur ini belum tersedia.",
		English:    "This feature is not yet available.",
	}
}
