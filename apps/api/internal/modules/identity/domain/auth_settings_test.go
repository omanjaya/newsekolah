package domain

import "testing"

func TestValidateAuthSettings(t *testing.T) {
	tests := []struct {
		name    string
		days    int
		wantErr bool
	}{
		{"minimum", 1, false},
		{"maximum", 365, false},
		{"default", DefaultSessionDays, false},
		{"zero rejected", 0, true},
		{"negative rejected", -1, true},
		{"over max rejected", 366, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAuthSettings(AuthSettings{SessionDays: tt.days})
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateAuthSettings(days=%d) error = %v, wantErr %v", tt.days, err, tt.wantErr)
			}
		})
	}
}
