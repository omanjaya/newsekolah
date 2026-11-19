package service

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func columnLabels(columns []reportdoc.Column) []string {
	labels := make([]string, len(columns))
	for i, column := range columns {
		labels[i] = column.Label
	}
	return labels
}

func TestDailyReportColumnsFollowTheRequestLocale(t *testing.T) {
	assert.Equal(t,
		[]string{"No", "Nama siswa", "Status", "Jumlah sesi", "Sesi terisi", "Lengkap"},
		columnLabels(dailyReportColumns(reportdoc.LocaleID)),
		"Indonesian headers in sentence case, as the web dialog shows them")
	assert.Equal(t,
		[]string{"No.", "Student name", "Status", "Sessions", "Sessions filled", "Complete"},
		columnLabels(dailyReportColumns(reportdoc.LocaleEN)))
	assert.Equal(t,
		columnLabels(dailyReportColumns(reportdoc.LocaleID)),
		columnLabels(dailyReportColumns("fr")),
		"an unknown locale falls back to Indonesian, the module's default")
}

func TestMonthlyRecapColumnsTranslateTheirOwnHeadersButNotTheTenantStatuses(t *testing.T) {
	policy := domain.DefaultStatusPolicy()

	assert.Equal(t,
		[]string{"No", "NIS", "Nama siswa", "Hadir", "Sakit", "Izin", "Dispensasi", "Alpha", "Total", "Persentase hadir"},
		columnLabels(monthlyRecapColumns(reportdoc.LocaleID, policy)))
	assert.Equal(t,
		[]string{"No.", "NIS", "Student name", "Hadir", "Sakit", "Izin", "Dispensasi", "Alpha", "Total", "Attendance rate"},
		columnLabels(monthlyRecapColumns(reportdoc.LocaleEN, policy)),
		"status columns carry the school's own labels in every locale")
}
