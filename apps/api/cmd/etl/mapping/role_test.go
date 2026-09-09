package mapping

import "testing"

func TestMapRole(t *testing.T) {
	cases := []struct {
		sionID   string
		wantSlug string
		wantOK   bool
	}{
		{"super_admin", "super_admin", true},
		{"admin", "admin", true},
		{"guru", "teacher", true},
		{"pegawai", "staff", true},
		{"siswa", "student", true},
		{"orang_tua", "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		slug, ok := MapRole(tc.sionID)
		if slug != tc.wantSlug || ok != tc.wantOK {
			t.Errorf("MapRole(%q) = (%q, %v), want (%q, %v)", tc.sionID, slug, ok, tc.wantSlug, tc.wantOK)
		}
	}
}

func TestProfileKindForRole(t *testing.T) {
	cases := []struct {
		slug     string
		wantKind string
		wantOK   bool
	}{
		{"admin", "staff", true},
		{"staff", "staff", true},
		{"super_admin", "staff", true},
		{"teacher", "teacher", true},
		{"student", "student", true},
		{"parent", "", false},
		{"unknown", "", false},
	}
	for _, tc := range cases {
		kind, ok := ProfileKindForRole(tc.slug)
		if kind != tc.wantKind || ok != tc.wantOK {
			t.Errorf("ProfileKindForRole(%q) = (%q, %v), want (%q, %v)", tc.slug, kind, ok, tc.wantKind, tc.wantOK)
		}
	}
}
