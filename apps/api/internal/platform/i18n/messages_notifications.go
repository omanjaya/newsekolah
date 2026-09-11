package i18n

// init appends the notifications module's error codes to the shared
// catalog. catalog is a plain map (not a slice), so appending here from a
// separate file needs no export from i18n.go beyond the package-level var
// already being visible within the package.
func init() {
	catalog["NOTIFICATION_NOT_FOUND"] = map[string]string{
		Indonesian: "Notifikasi tidak ditemukan.",
		English:    "Notification not found.",
	}
	catalog["PUSH_DEVICE_NOT_FOUND"] = map[string]string{
		Indonesian: "Perangkat push tidak ditemukan.",
		English:    "Push device not found.",
	}
	catalog["PUSH_DEVICE_REGISTRATION_CONFLICT"] = map[string]string{
		Indonesian: "Pendaftaran perangkat push sedang diproses di tempat lain, coba lagi.",
		English:    "Push device registration is being processed elsewhere, please retry.",
	}
}
