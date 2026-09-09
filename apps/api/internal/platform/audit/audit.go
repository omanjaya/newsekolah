// Package audit writes to the append-only audit_logs table (schema in
// migrations/0001_platform_core.up.sql) from inside the tenant transaction
// a service use case already has open. It is a leaf platform package: no
// module or service needs to hand it SQL, only the facts of one action.
package audit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// Record inserts one audit_logs row inside the transaction already bound to
// ctx by database.WithTenantTx. actorUserID and actingAsUserID come from the
// request's authenticated identity: outside impersonation, actorUserID is
// the caller and actingAsUserID is empty; during impersonation, actorUserID
// is the real admin (the token's `act` claim) and actingAsUserID is the
// impersonated user the session belongs to. IP, user agent, and request ID
// are read from ctx (set by httpx's request middleware), never passed in by
// callers, so every call site records them identically.
//
// before and after are marshaled to JSON as given; a nil value is stored as
// SQL NULL rather than the JSON literal "null" so a create (no before) and a
// delete (no after) are distinguishable from a corrupt row.
func Record(ctx context.Context, tenantID uuid.UUID, action, entityType string, entityID uuid.UUID, before, after any) error {
	tx, ok := database.TxFromContext(ctx)
	if !ok {
		return errors.New("audit: Record called outside a transaction")
	}

	beforeJSON, err := marshalOrNil(before)
	if err != nil {
		return fmt.Errorf("audit: marshal before: %w", err)
	}
	afterJSON, err := marshalOrNil(after)
	if err != nil {
		return fmt.Errorf("audit: marshal after: %w", err)
	}

	actorUserID, _ := httpx.UserIDFromContext(ctx)
	var actingAsUserID pgtype.UUID
	if actorID, ok := httpx.ActorIDFromContext(ctx); ok {
		// Impersonation: the token's real actor overrides the session
		// owner as "who did this", and the session owner becomes "as whom".
		actingAsUserID = pgtype.UUID{Bytes: actorUserID, Valid: true}
		actorUserID = actorID
	}

	meta := httpx.RequestMetaFromContext(ctx)

	const stmt = `
		insert into audit_logs (
			tenant_id, actor_user_id, acting_as_user_id, action, entity_type, entity_id,
			before, after, ip, user_agent, request_id
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`

	_, err = tx.Exec(ctx, stmt,
		tenantID,
		nullableUUID(actorUserID),
		actingAsUserID,
		action,
		entityType,
		nullableUUID(entityID),
		beforeJSON,
		afterJSON,
		database.Inet(meta.IP),
		database.Text(meta.UserAgent),
		database.Text(httpx.RequestIDFromContext(ctx)),
	)
	if err != nil {
		return fmt.Errorf("audit: insert %s %s: %w", action, entityType, err)
	}
	return nil
}

// RecordSimple is Record for the common case of an action with no
// meaningful before/after payload (an archive, a restore, a password
// reset): only that it happened, to whom, and by whom.
func RecordSimple(ctx context.Context, tenantID uuid.UUID, action, entityType string, entityID uuid.UUID) error {
	return Record(ctx, tenantID, action, entityType, entityID, nil, nil)
}

func marshalOrNil(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	return json.Marshal(v)
}

func nullableUUID(id uuid.UUID) pgtype.UUID {
	if id == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}
