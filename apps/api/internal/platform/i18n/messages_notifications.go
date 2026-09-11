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
	catalog["WHATSAPP_TEMPLATE_NOT_FOUND"] = map[string]string{
		Indonesian: "Templat WhatsApp tidak ditemukan.",
		English:    "WhatsApp template not found.",
	}
	catalog["WHATSAPP_TEMPLATE_EXISTS"] = map[string]string{
		Indonesian: "Nama templat WhatsApp ini sudah dipakai.",
		English:    "That WhatsApp template name is already in use.",
	}
	catalog["WHATSAPP_PROVIDER_NOT_FOUND"] = map[string]string{
		Indonesian: "Penyedia WhatsApp belum dikonfigurasi untuk sekolah Anda.",
		English:    "No WhatsApp provider is configured for your school.",
	}
	catalog["WHATSAPP_DELIVERY_NOT_FOUND"] = map[string]string{
		Indonesian: "Riwayat pengiriman WhatsApp tidak ditemukan.",
		English:    "WhatsApp delivery record not found.",
	}
}
