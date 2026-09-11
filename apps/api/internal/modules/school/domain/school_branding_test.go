package domain

import "testing"

func TestValidateBrandingWrite(t *testing.T) {
	tests := []struct {
		name    string
		in      BrandingWrite
		wantErr bool
	}{
		{"minimal ok", BrandingWrite{Name: "SMA Negeri 1"}, false},
		{"with accent color ok", BrandingWrite{Name: "SMA Negeri 1", AccentColor: "#1F3A5F"}, false},
		{"empty name rejected", BrandingWrite{Name: ""}, true},
		{"name too long rejected", BrandingWrite{Name: string(make([]byte, 161))}, true},
		{"short_name too long rejected", BrandingWrite{Name: "A", ShortName: string(make([]byte, 41))}, true},
		{"tagline too long rejected", BrandingWrite{Name: "A", Tagline: string(make([]byte, 201))}, true},
		{"bad accent color rejected", BrandingWrite{Name: "A", AccentColor: "blue"}, true},
		{"accent color missing hash rejected", BrandingWrite{Name: "A", AccentColor: "1F3A5F"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateBrandingWrite(tt.in)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateBrandingWrite(%+v) error = %v, wantErr %v", tt.in, err, tt.wantErr)
			}
		})
	}
}
