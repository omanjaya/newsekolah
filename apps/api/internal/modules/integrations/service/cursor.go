package service

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
)

// EncodeCursor and DecodeCursor mirror the announcements module's keyset
// cursor: opaque to the client, ordered by (created_at, id) descending.
func EncodeCursor(createdAt time.Time, id uuid.UUID) string {
	raw := fmt.Sprintf("%d:%s", createdAt.UnixNano(), id.String())
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func DecodeCursor(s string) (Cursor, error) {
	if s == "" {
		return Cursor{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	parts := strings.SplitN(string(raw), ":", 2)
	if len(parts) != 2 {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return Cursor{}, fmt.Errorf("%w: cursor", domain.ErrInvalidInput)
	}
	return Cursor{Present: true, CreatedAt: time.Unix(0, nanos).UTC(), ID: id}, nil
}
