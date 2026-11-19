package service

import "github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"

// reportColumnVocabulary is the attendance exports' column headers per
// locale (docs/05-shared-components.md, "Lokalisasi"), in sentence case
// like every table header in the app. apps/web's download dialog shows the
// same labels from its own catalogue (messages/features/attendanceReports.
// {id,en}.json, "exportColumns") and sends a label only when the reader
// renames a column, so the two must stay word for word the same. The
// monthly recap's status columns are not here: they carry the tenant's own
// status labels (domain.StatusPolicy), which are school content and never
// translated.
var reportColumnVocabulary = map[string]map[string]string{
	reportdoc.LocaleID: {
		"no": "No", "nis": "NIS", "name": "Nama siswa", "status": "Status",
		"expected": "Jumlah sesi", "submitted": "Sesi terisi", "complete": "Lengkap",
		"total": "Total", "percentage": "Persentase hadir",
	},
	reportdoc.LocaleEN: {
		"no": "No.", "nis": "NIS", "name": "Student name", "status": "Status",
		"expected": "Sessions", "submitted": "Sessions filled", "complete": "Complete",
		"total": "Total", "percentage": "Attendance rate",
	},
}

// reportColumnLabel is key's header in locale, falling back to
// Indonesian, this module's default language.
func reportColumnLabel(locale, key string) string {
	if labels, ok := reportColumnVocabulary[locale]; ok {
		if label, ok := labels[key]; ok {
			return label
		}
	}
	return reportColumnVocabulary[reportdoc.LocaleID][key]
}
