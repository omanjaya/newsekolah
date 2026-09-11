package i18n

func init() {
	catalog["ASSESSMENT_COMPONENT_NOT_FOUND"] = map[string]string{Indonesian: "Komponen penilaian tidak ditemukan.", English: "Assessment component not found."}
	catalog["ASSESSMENT_COMPONENT_CODE_EXISTS"] = map[string]string{Indonesian: "Kode komponen sudah dipakai pada kelas dan mapel ini.", English: "That component code is already used for this class and subject."}
	catalog["NOT_TEACHING_THIS_CLASS"] = map[string]string{Indonesian: "Anda bukan pengampu kelas dan mapel ini.", English: "You are not the teacher for this class and subject."}
	catalog["GRADES_NOT_PUBLISHED"] = map[string]string{Indonesian: "Nilai belum dipublikasikan.", English: "Grades are not published yet."}
	catalog["STAR_BALANCE_NEGATIVE"] = map[string]string{Indonesian: "Saldo bintang tidak boleh kurang dari nol.", English: "The star balance cannot go below zero."}
	catalog["NO_ACTIVE_TERM"] = map[string]string{Indonesian: "Belum ada semester aktif.", English: "No active term yet."}
	catalog["SCORE_OUT_OF_RANGE"] = map[string]string{Indonesian: "Nilai di luar rentang skala sekolah.", English: "Score is outside the school's grading scale."}
	catalog["ASSESSMENT_COMPONENT_HAS_GRADES"] = map[string]string{Indonesian: "Komponen ini sudah memiliki nilai dan tidak dapat dihapus.", English: "This component already has grades recorded and cannot be deleted."}
	catalog["NO_GRADABLE_SUBJECTS"] = map[string]string{Indonesian: "Tidak ada mata pelajaran yang dapat dinilai untuk kelas ini.", English: "There are no gradable subjects for this class."}
	catalog["STUDENT_NOT_IN_CLASS"] = map[string]string{Indonesian: "Siswa tidak terdaftar di kelas ini.", English: "The student is not enrolled in this class."}
	catalog["GRADE_RANGE_OVERLAP"] = map[string]string{Indonesian: "Rentang nilai tumpang tindih dengan rentang lain pada skala ini.", English: "The score range overlaps another range on this scale."}
	catalog["TP_EXPORT_CODE_EXISTS"] = map[string]string{Indonesian: "Kode ekspor tujuan pembelajaran ini sudah dipakai.", English: "That learning objective export code is already in use."}
	catalog["TP_KIND_NOT_ELIGIBLE"] = map[string]string{Indonesian: "Komponen penilaian ini tidak dapat dipetakan sebagai tujuan pembelajaran.", English: "This assessment component cannot be mapped as a learning objective."}
	catalog["TP_MAPPING_NOT_FOUND"] = map[string]string{Indonesian: "Pemetaan tujuan pembelajaran tidak ditemukan.", English: "Learning objective mapping not found."}
	catalog["GRADING_MODULE_DISABLED"] = map[string]string{Indonesian: "Modul penilaian belum diaktifkan untuk sekolah Anda.", English: "The grading module is not enabled for your school."}
}
