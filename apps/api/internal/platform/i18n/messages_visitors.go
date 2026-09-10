package i18n

func init() {
	catalog["EXPECTED_GUEST_NOT_FOUND"] = map[string]string{Indonesian: "Tamu yang dijadwalkan tidak ditemukan.", English: "Expected guest not found."}
	catalog["EXPECTED_GUEST_RESOLVED"] = map[string]string{Indonesian: "Entri tamu ini sudah diproses.", English: "This expected-guest entry was already resolved."}
	catalog["VISIT_NOT_FOUND"] = map[string]string{Indonesian: "Kunjungan tidak ditemukan.", English: "Visit not found."}
	catalog["VISIT_ALREADY_CHECKED_OUT"] = map[string]string{Indonesian: "Tamu ini sudah keluar kampus.", English: "This visitor has already checked out."}
	catalog["INCIDENT_NOT_FOUND"] = map[string]string{Indonesian: "Catatan insiden tidak ditemukan.", English: "Incident record not found."}
	catalog["INCIDENT_ALREADY_CLOSED"] = map[string]string{Indonesian: "Insiden ini sudah ditutup.", English: "This incident is already closed."}
	catalog["INCIDENT_FORBIDDEN"] = map[string]string{Indonesian: "Anda tidak berwenang membaca insiden ini.", English: "You are not authorized to read this incident."}
	catalog["VISITORS_MODULE_DISABLED"] = map[string]string{Indonesian: "Modul kunjungan tamu belum diaktifkan untuk sekolah ini.", English: "The visitors module is not enabled for this school."}
}
