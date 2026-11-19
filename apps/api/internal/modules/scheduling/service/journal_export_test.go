package service

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func TestJournalReportColumnsFollowTheRequestLocale(t *testing.T) {
	labels := func(locale string) []string {
		columns := journalReportColumns(locale)
		out := make([]string, len(columns))
		for i, column := range columns {
			out[i] = column.Label
		}
		return out
	}

	assert.Equal(t,
		[]string{"Tanggal", "Kelas", "Mata pelajaran", "Guru", "Ditulis oleh", "Topik", "Kegiatan", "Refleksi"},
		labels(reportdoc.LocaleID),
		"Indonesian headers in sentence case, as the web dialog shows them")
	assert.Equal(t,
		[]string{"Date", "Class", "Subject", "Teacher", "Written by", "Topic", "Activities", "Reflection"},
		labels(reportdoc.LocaleEN))
	assert.Equal(t, labels(reportdoc.LocaleID), labels("fr"),
		"an unknown locale falls back to Indonesian, the module's default")
}
