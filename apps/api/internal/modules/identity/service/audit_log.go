package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// AuditLogRecord is one audit_logs row.
type AuditLogRecord struct {
	ID             uuid.UUID
	ActorUserID    uuid.NullUUID
	ActingAsUserID uuid.NullUUID
	Action         string
	EntityType     string
	EntityID       uuid.NullUUID
	Before         []byte
	After          []byte
	IP             string
	UserAgent      string
	RequestID      string
	OccurredAt     time.Time
}

// AuditLogFilter narrows GET /v1/audit-logs.
type AuditLogFilter struct {
	ActorUserID uuid.NullUUID
	EntityType  string
	EntityID    uuid.NullUUID
	From        time.Time
	To          time.Time
	Cursor      uuid.UUID
	Limit       int
}

// AuditLogListResult is one page of the audit log.
type AuditLogListResult struct {
	Items      []AuditLogRecord
	NextCursor uuid.UUID
}

// AuditRepository is the data-access boundary for reading the audit log
// (writes go through platform/audit.Record directly from every mutation).
type AuditRepository interface {
	ListAuditLogRecords(ctx context.Context, tenantID uuid.UUID, f AuditLogFilter) ([]AuditLogRecord, error)
}

// ListAuditLogs returns one page of the audit log for view_audit_logs
// holders, newest first.
func (s *Service) ListAuditLogs(ctx context.Context, tenantID uuid.UUID, f AuditLogFilter) (AuditLogListResult, error) {
	f.Limit = clampLimit(f.Limit)

	var result AuditLogListResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		items, err := s.repo.ListAuditLogRecords(ctx, tenantID, f)
		if err != nil {
			return fmt.Errorf("list audit logs: %w", err)
		}
		result.Items = items
		if len(items) == f.Limit {
			result.NextCursor = items[len(items)-1].ID
		}
		return nil
	})
	return result, err
}
