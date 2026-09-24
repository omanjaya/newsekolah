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

func TestEmptyRowsLabelFor(t *testing.T) {
	assert.Equal(t, "Tidak ada data", EmptyRowsLabelFor(LocaleID))
	assert.Equal(t, "No data", EmptyRowsLabelFor(LocaleEN))
	assert.Equal(t, "No data", EmptyRowsLabelFor("fr"))
}
