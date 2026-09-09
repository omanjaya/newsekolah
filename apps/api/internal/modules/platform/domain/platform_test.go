package domain

import "testing"

func TestTenantInputValidate(t *testing.T) {
	valid := TenantInput{
		Slug: "sman-1-denpasar", Name: "SMAN 1 Denpasar", EducationLevel: "sma",
		Timezone: "Asia/Makassar", AdminUsername: "admin", AdminName: "Admin Sekolah",
	}

	tests := []struct {
		name    string
		mutate  func(in TenantInput) TenantInput
		wantErr bool
	}{
		{"valid input", func(in TenantInput) TenantInput { return in }, false},
		{"blank slug", func(in TenantInput) TenantInput { in.Slug = ""; return in }, true},
		{"uppercase slug", func(in TenantInput) TenantInput { in.Slug = "SMAN-1"; return in }, true},
		{"slug too short", func(in TenantInput) TenantInput { in.Slug = "a1"; return in }, true},
		{"slug with leading dash", func(in TenantInput) TenantInput { in.Slug = "-sman-1"; return in }, true},
		{"blank name", func(in TenantInput) TenantInput { in.Name = "  "; return in }, true},
		{"name too long", func(in TenantInput) TenantInput { in.Name = string(make([]byte, 151)); return in }, true},
		{"unknown education level", func(in TenantInput) TenantInput { in.EducationLevel = "college"; return in }, true},
		{"blank timezone", func(in TenantInput) TenantInput { in.Timezone = ""; return in }, true},
		{"blank admin username", func(in TenantInput) TenantInput { in.AdminUsername = ""; return in }, true},
		{"blank admin name", func(in TenantInput) TenantInput { in.AdminName = "  "; return in }, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.mutate(valid).Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestEducationLevelValid(t *testing.T) {
	for _, l := range []EducationLevel{LevelSD, LevelSMP, LevelSMA, LevelSMK} {
		if !l.Valid() {
			t.Errorf("%q should be valid", l)
		}
	}
	if EducationLevel("college").Valid() {
		t.Error(`"college" should not be valid`)
	}
}

func TestModuleValid(t *testing.T) {
	for _, m := range AllModules {
		if !m.Valid() {
			t.Errorf("%q should be valid", m)
		}
	}
	if Module("unknown").Valid() {
		t.Error(`"unknown" should not be valid`)
	}
}
