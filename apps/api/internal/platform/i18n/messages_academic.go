package i18n

// Academic module message entries. Declared in a separate file (per the
// academic module's ownership notes) and appended to catalog in init(),
// rather than edited into i18n.go, so parallel module work never conflicts
// on that file.
func init() {
	for code, entry := range map[string]map[string]string{
		"ACADEMIC_YEAR_NAME_EXISTS": {
			Indonesian: "Nama tahun ajaran sudah digunakan.",
			English:    "An academic year with this name already exists.",
		},
		"ACADEMIC_YEAR_ARCHIVED": {
			Indonesian: "Tahun ajaran ini sudah diarsipkan.",
			English:    "This academic year is archived.",
		},
		"ACADEMIC_TERM_SEQUENCE_TAKEN": {
			Indonesian: "Urutan semester ini sudah digunakan pada tahun ajaran tersebut.",
			English:    "This term sequence is already used in this academic year.",
		},
		"ACADEMIC_CODE_EXISTS": {
			Indonesian: "Kode ini sudah digunakan.",
			English:    "This code already exists.",
		},
		"ACADEMIC_CLASS_NAME_EXISTS": {
			Indonesian: "Nama kelas sudah digunakan pada tahun ajaran ini.",
			English:    "A class with this name already exists in this academic year.",
		},
		"ACADEMIC_HAS_DEPENDENTS": {
			Indonesian: "Data ini masih memiliki data terkait dan tidak dapat dihapus.",
			English:    "This record has dependent data and cannot be deleted.",
		},
		"ACADEMIC_ENROLLMENT_EXISTS": {
			Indonesian: "Siswa sudah memiliki pendaftaran aktif pada tahun ajaran ini.",
			English:    "This student already has an active enrollment for this academic year.",
		},
		"ACADEMIC_OFFERING_EXISTS": {
			Indonesian: "Penawaran mata pelajaran ini sudah ada untuk tahun ajaran dan tingkat kelas tersebut.",
			English:    "This subject offering already exists for this academic year and grade level.",
		},
		"ACADEMIC_PERIOD_SEQUENCE_TAKEN": {
			Indonesian: "Urutan periode ini sudah digunakan pada template tersebut.",
			English:    "This period sequence is already used in this template.",
		},
		"ACADEMIC_TEACHING_ASSIGNMENT_EXISTS": {
			Indonesian: "Guru ini sudah ditugaskan untuk mata pelajaran dan kelas tersebut.",
			English:    "This teacher is already assigned to this subject and class.",
		},
		"ACADEMIC_TEACHER_NOT_ASSIGNED": {
			Indonesian: "Guru tidak memiliki penugasan mengajar untuk mata pelajaran dan kelas tersebut.",
			English:    "This teacher has no teaching assignment for this subject and class.",
		},
	} {
		catalog[code] = entry
	}
}
