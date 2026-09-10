package i18n

func init() {
	catalog["ANALYTICS_NO_ACTIVE_ACADEMIC_YEAR"] = map[string]string{
		Indonesian: "Tidak ada tahun ajaran aktif.", English: "No active academic year.",
	}
	catalog["ANALYTICS_NOT_HOMEROOM_TEACHER"] = map[string]string{
		Indonesian: "Anda bukan wali kelas mana pun tahun ajaran ini.", English: "You are not the homeroom teacher of any class this academic year.",
	}
	catalog["ANALYTICS_RESULT_NOT_FOUND"] = map[string]string{
		Indonesian: "Data risiko siswa ini tidak ditemukan.", English: "This student's risk result was not found.",
	}
	catalog["ANALYTICS_INVALID_POLICY"] = map[string]string{
		Indonesian: "Kebijakan tidak valid: batas siaga harus di bawah batas berisiko.", English: "Invalid policy: watch thresholds must be below at-risk thresholds.",
	}
}
