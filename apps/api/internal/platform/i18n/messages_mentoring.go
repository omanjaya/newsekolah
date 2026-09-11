package i18n

// init-merge: mentoring module error codes (errors_mentoring.go).
func init() {
	catalog["MENTOR_GROUP_NOT_FOUND"] = map[string]string{Indonesian: "Kelompok bimbingan tidak ditemukan.", English: "Mentoring group not found."}
	catalog["MENTOR_GROUP_FULL"] = map[string]string{Indonesian: "Kelompok bimbingan ini sudah penuh.", English: "This mentoring group is full."}
	catalog["MENTOR_MEMBER_ALREADY_IN_GROUP"] = map[string]string{Indonesian: "Siswa sudah menjadi anggota kelompok bimbingan ini.", English: "The student is already a member of this mentoring group."}
	catalog["MENTOR_NOTE_NOT_FOUND"] = map[string]string{Indonesian: "Catatan bimbingan tidak ditemukan.", English: "Mentoring note not found."}
	catalog["MENTOR_NOTE_FORBIDDEN"] = map[string]string{Indonesian: "Anda tidak berwenang mengakses catatan bimbingan ini.", English: "You are not permitted to access this mentoring note."}
	catalog["MENTOR_SUMMARY_NOT_FOUND"] = map[string]string{Indonesian: "Ringkasan bimbingan tidak ditemukan.", English: "Mentoring summary not found."}
	catalog["MENTORING_MODULE_DISABLED"] = map[string]string{Indonesian: "Modul bimbingan belum diaktifkan untuk sekolah Anda.", English: "The mentoring module is not enabled for your school."}
}
