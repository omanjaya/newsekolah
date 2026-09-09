package service

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Cursor is a decoded keyset pagination position: (created_at, id) of the
// last row the caller already saw, ordered newest first.
type Cursor struct {
	Present   bool
	CreatedAt time.Time
	ID        uuid.UUID
}

// EncodeCursor produces the opaque string a list response's next_cursor
// carries, and that a follow-up request's ?cursor= echoes back.
func EncodeCursor(createdAt time.Time, id uuid.UUID) string {
	raw := fmt.Sprintf("%d:%s", createdAt.UnixNano(), id.String())
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// DecodeCursor parses a cursor string; an empty string decodes to the
// zero-value first-page Cursor rather than an error.
func DecodeCursor(s string) (Cursor, error) {
	if s == "" {
		return Cursor{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("decode cursor: %w", err)
	}
	parts := strings.SplitN(string(raw), ":", 2)
	if len(parts) != 2 {
		return Cursor{}, fmt.Errorf("decode cursor: malformed")
	}
	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return Cursor{}, fmt.Errorf("decode cursor: malformed timestamp: %w", err)
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return Cursor{}, fmt.Errorf("decode cursor: malformed id: %w", err)
	}
	return Cursor{Present: true, CreatedAt: time.Unix(0, nanos).UTC(), ID: id}, nil
}
