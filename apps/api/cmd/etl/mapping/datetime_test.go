package mapping

import (
	"testing"
	"time"
)

func TestLocalToUTC(t *testing.T) {
	makassar, err := time.LoadLocation("Asia/Makassar")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}
	naive := time.Date(2026, 3, 2, 7, 30, 0, 0, time.UTC)
	got := LocalToUTC(naive, makassar)
	want := time.Date(2026, 3, 1, 23, 30, 0, 0, time.UTC) // Makassar is UTC+8
	if !got.Equal(want) {
		t.Errorf("LocalToUTC = %v, want %v", got, want)
	}
	if got.Location() != time.UTC {
		t.Errorf("LocalToUTC result location = %v, want UTC", got.Location())
	}
}

func TestLocalDate(t *testing.T) {
	naive := time.Date(2026, 3, 2, 15, 0, 0, 0, time.UTC)
	got := LocalDate(naive)
	want := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("LocalDate = %v, want %v", got, want)
	}
}

func TestAcademicYearDates(t *testing.T) {
	start, end, err := AcademicYearDates("2026/2027")
	if err != nil {
		t.Fatalf("AcademicYearDates: %v", err)
	}
	if want := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC); !start.Equal(want) {
		t.Errorf("start = %v, want %v", start, want)
	}
	if want := time.Date(2027, time.June, 30, 0, 0, 0, 0, time.UTC); !end.Equal(want) {
		t.Errorf("end = %v, want %v", end, want)
	}

	if _, _, err := AcademicYearDates("2026"); err == nil {
		t.Error("expected error for malformed label")
	}
	if _, _, err := AcademicYearDates("2026/2028"); err == nil {
		t.Error("expected error for non-consecutive years")
	}
}
