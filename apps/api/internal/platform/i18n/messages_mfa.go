package i18n

func init() {
	catalog["MFA_NOT_AVAILABLE"] = map[string]string{Indonesian: "Verifikasi dua langkah belum tersedia di server ini.", English: "Two-factor authentication is not configured on this server."}
	catalog["MFA_NOT_ENROLLED"] = map[string]string{Indonesian: "Verifikasi dua langkah belum diaktifkan untuk akun ini.", English: "Two-factor authentication is not enabled for this account."}
	catalog["MFA_INVALID_CODE"] = map[string]string{Indonesian: "Kode verifikasi salah atau sudah kedaluwarsa.", English: "That verification code is wrong or has expired."}
	catalog["MFA_REQUIRED"] = map[string]string{Indonesian: "Masukkan kode verifikasi dua langkah.", English: "Enter your two-factor verification code."}
}
