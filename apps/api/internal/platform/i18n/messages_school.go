package i18n

// init-merge: school module error codes (onboarding.go).
func init() {
	catalog["TENANT_HAS_DATA"] = map[string]string{
		Indonesian: "Sekolah ini sudah memiliki data dan tidak dapat menjalankan onboarding ulang.",
		English:    "This school already has data and cannot be re-onboarded.",
	}
	catalog["NO_ACTIVE_ACADEMIC_YEAR"] = map[string]string{
		Indonesian: "Sekolah belum memiliki tahun ajaran aktif.",
		English:    "This school has no active academic year.",
	}
}
