package domain

import (
	"net"
	"testing"
)

func TestIsDisallowedAddress(t *testing.T) {
	cases := []struct {
		name string
		ip   string
		want bool
	}{
		{"loopback v4", "127.0.0.1", true},
		{"loopback v6", "::1", true},
		{"link-local", "169.254.1.1", true},
		{"unspecified v4", "0.0.0.0", true},
		{"private class A", "10.0.0.5", true},
		{"private class B", "172.16.0.5", true},
		{"private class C", "192.168.1.5", true},
		{"unique local v6", "fd00::1", true},
		{"public v4", "93.184.216.34", false},
		{"public v6", "2606:2800:220:1:248:1893:25c8:1946", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ip := net.ParseIP(tc.ip)
			if ip == nil {
				t.Fatalf("failed to parse test IP %q", tc.ip)
			}
			if got := IsDisallowedAddress(ip); got != tc.want {
				t.Errorf("IsDisallowedAddress(%s) = %v, want %v", tc.ip, got, tc.want)
			}
		})
	}

	t.Run("nil address is disallowed", func(t *testing.T) {
		if !IsDisallowedAddress(nil) {
			t.Error("expected a nil address to be disallowed")
		}
	})
}
