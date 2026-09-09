package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) ListAuditLogRecords(ctx context.Context, tenantID uuid.UUID, f service.AuditLogFilter) ([]service.AuditLogRecord, error) {
	rows, err := r.queries(ctx).ListAuditLogs(ctx, db.ListAuditLogsParams{
		TenantID:    pdatabase.NullUUID(uuid.NullUUID{UUID: tenantID, Valid: true}),
		ActorUserID: pdatabase.NullUUID(f.ActorUserID),
		EntityType:  nullableText(f.EntityType),
		EntityID:    pdatabase.NullUUID(f.EntityID),
		FromDate:    pdatabase.Timestamptz(f.From),
		ToDate:      pdatabase.Timestamptz(f.To),
		CursorID:    cursorParam(f.Cursor),
		PageLimit:   int32(f.Limit), //nolint:gosec // f.Limit is clamped by clampLimit before this call
	})
	if err != nil {
		return nil, fmt.Errorf("list audit logs: %w", err)
	}
	out := make([]service.AuditLogRecord, len(rows))
	for i, row := range rows {
		out[i] = service.AuditLogRecord{
			ID:             row.ID,
			ActorUserID:    pdatabase.UUIDOrNil(row.ActorUserID),
			ActingAsUserID: pdatabase.UUIDOrNil(row.ActingAsUserID),
			Action:         row.Action,
			EntityType:     row.EntityType,
			EntityID:       pdatabase.UUIDOrNil(row.EntityID),
			Before:         row.Before,
			After:          row.After,
			IP:             pdatabase.InetOrEmpty(row.Ip),
			UserAgent:      pdatabase.TextOrEmpty(row.UserAgent),
			RequestID:      pdatabase.TextOrEmpty(row.RequestID),
			OccurredAt:     pdatabase.TimeOrZero(row.OccurredAt),
		}
	}
	return out, nil
}
