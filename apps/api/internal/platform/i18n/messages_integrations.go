package i18n

func init() {
	catalog["API_KEY_NOT_FOUND"] = map[string]string{Indonesian: "Kunci API tidak ditemukan.", English: "API key not found."}
	catalog["API_KEY_ALREADY_REVOKED"] = map[string]string{Indonesian: "Kunci API ini sudah dicabut.", English: "This API key was already revoked."}
	catalog["API_KEY_PERMISSION_EXCEEDS_USER"] = map[string]string{Indonesian: "Izin yang dipilih melebihi izin akun Anda sendiri.", English: "The selected permissions exceed your own account's permissions."}
	catalog["API_KEY_INVALID"] = map[string]string{Indonesian: "Kunci API tidak valid.", English: "Invalid API key."}
	catalog["API_KEY_EXPIRED"] = map[string]string{Indonesian: "Kunci API sudah kedaluwarsa.", English: "This API key has expired."}
	catalog["API_KEY_REVOKED"] = map[string]string{Indonesian: "Kunci API sudah dicabut.", English: "This API key has been revoked."}
	catalog["API_KEY_IP_NOT_ALLOWED"] = map[string]string{Indonesian: "Alamat IP ini tidak diizinkan untuk kunci API tersebut.", English: "This IP address is not allowed for that API key."}
	catalog["API_KEY_RATE_LIMITED"] = map[string]string{Indonesian: "Kunci API ini telah melebihi batas permintaan.", English: "This API key has exceeded its request rate limit."}
	catalog["WEBHOOK_ENDPOINT_NOT_FOUND"] = map[string]string{Indonesian: "Endpoint webhook tidak ditemukan.", English: "Webhook endpoint not found."}
	catalog["WEBHOOK_ENDPOINT_DISABLED"] = map[string]string{Indonesian: "Endpoint webhook ini dinonaktifkan setelah gagal berulang kali.", English: "This webhook endpoint was disabled after repeated failures."}
	catalog["WEBHOOK_URL_NOT_ALLOWED"] = map[string]string{Indonesian: "URL ini tidak dapat digunakan sebagai endpoint webhook.", English: "This URL cannot be used as a webhook endpoint."}
	catalog["WEBHOOK_EVENT_TYPE_UNKNOWN"] = map[string]string{Indonesian: "Jenis peristiwa tidak dikenali.", English: "Unknown event type."}
	catalog["WEBHOOK_DELIVERY_NOT_FOUND"] = map[string]string{Indonesian: "Riwayat pengiriman webhook tidak ditemukan.", English: "Webhook delivery not found."}
	catalog["WEBHOOK_DELIVERY_NOT_FAILED"] = map[string]string{Indonesian: "Hanya pengiriman yang gagal yang dapat dicoba ulang.", English: "Only a failed delivery can be retried."}
}
