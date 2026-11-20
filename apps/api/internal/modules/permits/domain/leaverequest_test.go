package domain

import (
	"testing"
	"time"
)

func TestDefaultReasonFor(t *testing.T) {
	cases := []struct {
		category  Category
		wantLabel string
		wantOK    bool
	}{
		{CategoryReligiousCeremony, "Upacara agama", true},
		{CategorySick, "Sakit", true},
		{CategoryDispensation, "Dispen", true},
		{CategoryOther, "", false},
		{Category("unknown"), "", false},
	}
	for _, tc := range cases {
		label, ok := DefaultReasonFor(tc.category)
		if ok != tc.wantOK || label != tc.wantLabel {
			t.Errorf("DefaultReasonFor(%q) = (%q, %v), want (%q, %v)", tc.category, label, ok, tc.wantLabel, tc.wantOK)
		}
	}
}

func TestCategoryLabel(t *testing.T) {
	cases := map[Category]string{
		CategoryReligiousCeremony: "Upacara keagamaan",
		CategorySick:              "Sakit",
		CategoryDispensation:      "Dispensasi",
		CategoryOther:             "Lainnya",
		Category("unknown"):       "unknown",
	}
	for c, want := range cases {
		if got := CategoryLabel(c); got != want {
			t.Errorf("CategoryLabel(%q) = %q, want %q", c, got, want)
		}
	}
}

// A Friday-to-Tuesday leave over a weekend and a Monday holiday is two
// school days: only the teaching days inside the range count, whatever
// their time of day.
func TestLeaveRequestSchoolDays(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2027, time.February, d, 0, 0, 0, 0, time.UTC) }
	lr := LeaveRequest{StartsOn: day(5), EndsOn: day(9)}
	teaching := []time.Time{day(4), day(5), day(9).Add(7 * time.Hour), day(10)}

	if got := lr.Days(); got != 5 {
		t.Fatalf("Days() = %d, want 5 calendar days", got)
	}
	if got := lr.SchoolDays(teaching); got != 2 {
		t.Fatalf("SchoolDays() = %d, want 2 (Fri 5 and Tue 9)", got)
	}
	if got := lr.SchoolDays(nil); got != 0 {
		t.Fatalf("SchoolDays(nil) = %d, want 0", got)
	}
}
