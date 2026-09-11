package domain

import "testing"

func TestValidateWebPushEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		wantErr  bool
	}{
		{"fcm exact", "https://fcm.googleapis.com/fcm/send/abc123", false},
		{"fcm subdomain", "https://android.fcm.googleapis.com/fcm/send/abc123", false},
		{"mozilla", "https://updates.push.services.mozilla.com/wpush/v2/abc", false},
		{"apple", "https://web.push.apple.com/QAbc", false},
		{"windows", "https://wns2-abc.notify.windows.com/w/?token=abc", false},
		{"wns legacy", "https://db3.notify.wns.windows.com/", false},
		{"http rejected", "http://fcm.googleapis.com/fcm/send/abc123", true},
		{"arbitrary host rejected", "https://evil.example.com/fcm/send/abc123", true},
		{"unparseable rejected", "not a url", true},
		{"empty rejected", "", true},
		{"userinfo rejected", "https://user:pass@fcm.googleapis.com/fcm/send/abc", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateWebPushEndpoint(tt.endpoint)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateWebPushEndpoint(%q) error = %v, wantErr %v", tt.endpoint, err, tt.wantErr)
			}
		})
	}
}
