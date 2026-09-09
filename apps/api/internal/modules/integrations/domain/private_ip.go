package domain

import "net"

// IsDisallowedAddress reports whether ip must never be used as a webhook
// destination: loopback, link-local, private (RFC 1918 / ULA), or
// unspecified. A school's webhook receiver must be a real, publicly
// addressable endpoint -- otherwise a malicious or careless registration
// could turn the delivery worker into a probe of the API's own internal
// network (SSRF), which is why the service resolves the endpoint's host
// and checks every resolved address with this before ever registering it,
// and again before every delivery in case DNS changed since.
func IsDisallowedAddress(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}
	if ip.IsPrivate() {
		return true
	}
	return false
}
