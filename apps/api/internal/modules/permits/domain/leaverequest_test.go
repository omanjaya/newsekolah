package domain

import "testing"

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
