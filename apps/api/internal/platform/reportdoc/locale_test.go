package reportdoc

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestFormatDateIndonesian(t *testing.T) {
	got := FormatDate(LocaleID, time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC))
	assert.Equal(t, "2 September 2026", got)
}

func TestFormatDateEnglishAndUnknownLocaleFallsBackToEnglish(t *testing.T) {
	want := "September 2, 2026"
	assert.Equal(t, want, FormatDate(LocaleEN, time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)))
	assert.Equal(t, want, FormatDate("fr", time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)))
}

func TestPageLabel(t *testing.T) {
	assert.Equal(t, "Halaman {page} dari {pages}", PageLabel(LocaleID))
	assert.Equal(t, "Page {page} of {pages}", PageLabel(LocaleEN))
	assert.Equal(t, "Page {page} of {pages}", PageLabel("fr"))
}

func TestFormatMonth(t *testing.T) {
	assert.Equal(t, "November 2026", FormatMonth(LocaleID, time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)))
	assert.Equal(t, "Agustus 2026", FormatMonth(LocaleID, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)))
	assert.Equal(t, "August 2026", FormatMonth(LocaleEN, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)))
}

func TestFormatInteger(t *testing.T) {
	assert.Equal(t, "0", FormatInteger(LocaleID, 0))
	assert.Equal(t, "999", FormatInteger(LocaleID, 999))
	assert.Equal(t, "75.000", FormatInteger(LocaleID, 75000))
	assert.Equal(t, "1.250.000", FormatInteger(LocaleID, 1250000))
	assert.Equal(t, "-100.000", FormatInteger(LocaleID, -100000))
	assert.Equal(t, "75,000", FormatInteger(LocaleEN, 75000))
}

func TestEmptyRowsLabelFor(t *testing.T) {
	assert.Equal(t, "Tidak ada data", EmptyRowsLabelFor(LocaleID))
	assert.Equal(t, "No data", EmptyRowsLabelFor(LocaleEN))
	assert.Equal(t, "No data", EmptyRowsLabelFor("fr"))
}
