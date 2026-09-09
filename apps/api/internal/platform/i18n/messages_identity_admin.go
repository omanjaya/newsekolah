package i18n

// Error codes added by the identity module's administration features
// (users, roles, duties, impersonation, password reset, avatar upload).
// Appended to the package-level catalog in i18n.go via init, so that file
// stays untouched.
func init() {
	for code, entry := range identityAdminCatalog {
		catalog[code] = entry
	}
}

var identityAdminCatalog = map[string]map[string]string{
	"USER_ALREADY_EXISTS": {
		Indonesian: "Username, email, NIS, atau NIP sudah dipakai.",
		English:    "Username, email, NIS, or NIP is already in use.",
	},
	"USER_CANNOT_ARCHIVE_SELF": {
		Indonesian: "Anda tidak bisa mengarsipkan akun sendiri.",
		English:    "You cannot archive your own account.",
	},
	"ONLY_SUPER_ADMIN_CAN_GRANT_SUPER_ADMIN": {
		Indonesian: "Hanya super admin yang bisa memberikan peran super admin.",
		English:    "Only a super admin can grant the super admin role.",
	},
	"ROLE_SYSTEM_IMMUTABLE": {
		Indonesian: "Slug dan nama role sistem tidak bisa diubah.",
		English:    "A system role's slug and name cannot be changed.",
	},
	"ROLE_IN_USE": {
		Indonesian: "Role masih dipakai oleh satu atau lebih pengguna.",
		English:    "The role is still assigned to one or more users.",
	},
	"UNKNOWN_PERMISSION": {
		Indonesian: "Salah satu kode izin tidak dikenali.",
		English:    "One of the permission codes is not recognized.",
	},
	"DUTY_TYPE_IN_USE": {
		Indonesian: "Jenis tugas masih dipakai oleh satu atau lebih penugasan.",
		English:    "The duty type still has one or more assignments.",
	},
	"IMPERSONATION_NOT_ALLOWED": {
		Indonesian: "Pengguna ini tidak dapat diimpersonasi.",
		English:    "This user cannot be impersonated.",
	},
	"NOT_IMPERSONATING": {
		Indonesian: "Sesi ini bukan sesi impersonasi.",
		English:    "This session is not an impersonation session.",
	},
	"PASSWORD_RESET_TOKEN_INVALID": {
		Indonesian: "Tautan reset kata sandi tidak valid atau sudah kedaluwarsa.",
		English:    "The password reset link is invalid or has expired.",
	},
	"UPLOAD_INVALID_FILE_TYPE": {
		Indonesian: "Jenis berkas tidak didukung.",
		English:    "This file type is not supported.",
	},
	"UPLOAD_FILE_TOO_LARGE": {
		Indonesian: "Ukuran berkas melebihi batas yang diizinkan.",
		English:    "The file exceeds the allowed size.",
	},
	"UPLOAD_NOT_CONFIGURED": {
		Indonesian: "Penyimpanan berkas belum dikonfigurasi di server ini.",
		English:    "File storage is not configured on this server.",
	},
	"IMPORT_FILE_INVALID": {
		Indonesian: "Berkas impor tidak dapat dibaca atau formatnya tidak sesuai templat.",
		English:    "The import file could not be read or does not match the template.",
	},
}
