package domain

import (
	"time"

	"github.com/google/uuid"
)

// ItemEventType is why one row was added to a copy's audit trail.
type ItemEventType string

const (
	ItemEventCreated       ItemEventType = "created"
	ItemEventStatusChanged ItemEventType = "status_changed"
	ItemEventCirculation   ItemEventType = "circulation"
	ItemEventStocktake     ItemEventType = "stocktake"
)

// ItemEvent is one entry in a copy's history: created, a manual or
// circulation status change, or a stocktake outcome.
type ItemEvent struct {
	ID          uuid.UUID
	TenantID    uuid.UUID
	CopyID      uuid.UUID
	EventType   ItemEventType
	FromStatus  string
	ToStatus    string
	Note        string
	ActorUserID uuid.NullUUID
	CreatedAt   time.Time
}
