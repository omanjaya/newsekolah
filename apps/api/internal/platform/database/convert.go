package database

import (
	"net"
	"net/netip"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Text converts a Go string to pgtype.Text, treating "" as NULL so optional
// fields (email, phone, device name, ...) round-trip cleanly.
func Text(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func TextOrEmpty(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

// Int2 converts a Go int to pgtype.Int2, treating 0 as NULL. It backs the
// handful of small "year" columns (entry_year, joined_year) where 0 is not
// a meaningful year, only "not set".
func Int2(n int) pgtype.Int2 {
	if n == 0 {
		return pgtype.Int2{}
	}
	return pgtype.Int2{Int16: int16(n), Valid: true} //nolint:gosec // callers pass calendar years, far within int16 range
}

func Int2OrZero(n pgtype.Int2) int {
	if !n.Valid {
		return 0
	}
	return int(n.Int16)
}

func Date(t time.Time) pgtype.Date {
	if t.IsZero() {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: t, Valid: true}
}

func DateOrZero(d pgtype.Date) time.Time {
	if !d.Valid {
		return time.Time{}
	}
	return d.Time
}

func Timestamptz(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func TimeOrZero(t pgtype.Timestamptz) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return t.Time
}

// TimePtr returns nil for an invalid/NULL timestamp, matching the pattern
// domain types use for optional timestamps (e.g. Session.RevokedAt).
func TimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time
	return &tt
}

func UUIDOrNil(u pgtype.UUID) uuid.NullUUID {
	if !u.Valid {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: u.Bytes, Valid: true}
}

func NullUUID(u uuid.NullUUID) pgtype.UUID {
	if !u.Valid {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: u.UUID, Valid: true}
}

// Inet parses an IP string (possibly with a port, which is stripped) into
// the *netip.Addr pgx expects for an inet column. An unparsable or empty
// address is stored as NULL rather than failing the write -- IP is
// diagnostic, not load-bearing.
func Inet(s string) *netip.Addr {
	if s == "" {
		return nil
	}
	if host, _, err := net.SplitHostPort(s); err == nil {
		s = host
	}
	addr, err := netip.ParseAddr(s)
	if err != nil {
		return nil
	}
	return &addr
}

func InetOrEmpty(a *netip.Addr) string {
	if a == nil {
		return ""
	}
	return a.String()
}
