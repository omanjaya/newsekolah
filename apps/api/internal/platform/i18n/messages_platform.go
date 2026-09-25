package i18n

func init() {
	catalog["PLATFORM_TENANCY_DISABLED"] = map[string]string{Indonesian: "Konsol platform tidak tersedia pada mode single-tenant.", English: "The platform console is unavailable in single-tenant mode."}
	catalog["PLATFORM_TENANT_NOT_FOUND"] = map[string]string{Indonesian: "Sekolah tidak ditemukan.", English: "Tenant not found."}
	catalog["PLATFORM_SLUG_TAKEN"] = map[string]string{Indonesian: "Slug sekolah ini sudah dipakai.", English: "This tenant slug is already in use."}
	catalog["PLATFORM_DOMAIN_TAKEN"] = map[string]string{Indonesian: "Domain ini sudah dipakai sekolah lain.", English: "This domain is already in use by another tenant."}
	catalog["PLATFORM_UNKNOWN_MODULE"] = map[string]string{Indonesian: "Modul tidak dikenali.", English: "Unknown module."}
	catalog["PLATFORM_EXPORT_NOT_FOUND"] = map[string]string{Indonesian: "Proses ekspor tidak ditemukan.", English: "Export not found."}
	catalog["PLATFORM_STORAGE_DISABLED"] = map[string]string{Indonesian: "Penyimpanan objek belum dikonfigurasi, ekspor tidak dapat dijalankan.", English: "Object storage is not configured, so exports cannot run."}
	catalog["PLATFORM_TELEGRAM_TOKEN_MISSING"] = map[string]string{Indonesian: "Token bot Telegram belum diatur.", English: "The Telegram bot token is not configured."}
	catalog["PLATFORM_TELEGRAM_CHAT_MISSING"] = map[string]string{Indonesian: "ID chat Telegram belum diatur.", English: "The Telegram chat id is not configured."}
	catalog["PLATFORM_TELEGRAM_API_ERROR"] = map[string]string{Indonesian: "Telegram menolak permintaan ini. Periksa kembali token dan ID chat.", English: "Telegram rejected the request. Check the token and chat id."}
	catalog["PLATFORM_TELEGRAM_UNREACHABLE"] = map[string]string{Indonesian: "Tidak dapat menghubungi Telegram. Coba lagi nanti.", English: "Could not reach Telegram. Try again later."}
}
