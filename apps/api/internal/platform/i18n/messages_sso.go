package i18n

func init() {
	catalog["SSO_NOT_CONFIGURED"] = map[string]string{
		Indonesian: "Masuk dengan Google belum diaktifkan untuk sekolah ini.",
		English:    "Sign in with Google is not enabled for this school.",
	}
	catalog["SSO_ACCOUNT_NOT_FOUND"] = map[string]string{
		Indonesian: "Akun Google ini tidak terhubung dengan akun aktif di sekolah ini.",
		English:    "This Google account is not linked to an active account at this school.",
	}
	catalog["SSO_INVALID_TOKEN"] = map[string]string{
		Indonesian: "Gagal memverifikasi akun Google. Coba masuk kembali.",
		English:    "Could not verify your Google account. Please try signing in again.",
	}
	catalog["SSO_CLIENT_SECRET_REQUIRED"] = map[string]string{
		Indonesian: "Client secret wajib diisi saat mengaktifkan masuk dengan Google.",
		English:    "A client secret is required to enable sign in with Google.",
	}
	catalog["PASSKEY_NOT_CONFIGURED"] = map[string]string{
		Indonesian: "Passkey belum tersedia di server ini.",
		English:    "Passkeys are not available on this server.",
	}
	catalog["PASSKEY_NOT_FOUND"] = map[string]string{
		Indonesian: "Passkey tidak ditemukan.",
		English:    "Passkey not found.",
	}
	catalog["PASSKEY_CHALLENGE_EXPIRED"] = map[string]string{
		Indonesian: "Permintaan passkey sudah kedaluwarsa, silakan coba lagi.",
		English:    "That passkey request has expired, please try again.",
	}
	catalog["PASSKEY_INVALID_RESPONSE"] = map[string]string{
		Indonesian: "Perangkat tidak dapat memverifikasi passkey ini.",
		English:    "Your device could not verify this passkey.",
	}
}
