package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

func auditLogsFor(t *testing.T, pool *pgxpool.Pool, tenantID, entityID uuid.UUID) []db.AuditLog {
	t.Helper()
	rows, err := db.New(pool).ListAuditLogs(context.Background(), db.ListAuditLogsParams{
		TenantID:  pgtype.UUID{Bytes: tenantID, Valid: true},
		EntityID:  pgtype.UUID{Bytes: entityID, Valid: true},
		PageLimit: 50,
	})
	require.NoError(t, err)
	return rows
}

// TestIssueDocumentWritesAuditRecord covers the shared document pipeline
// every caller of IssueDocument relies on (discipline's warning letters,
// billing's receipts, visitors' badges): issuing a document must write an
// audit_logs row, keyed on the caller's own entity, inside the same
// transaction as the issued_documents insert.
func TestIssueDocumentWritesAuditRecord(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "permits-test-" + uuid.NewString(), Name: "Permits Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantRow.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	issuer, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "kepala-sekolah-" + uuid.NewString(), PasswordHash: "x",
		Name: "Kepala Sekolah Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	mod := Register(Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: service.Config{DocumentSigningKey: []byte("a-test-signing-key")},
	})

	entityID := uuid.Must(uuid.NewV7())
	result, err := mod.Service.IssueDocument(ctx, tenantRow.ID, service.IssueDocumentInput{
		Kind: domain.TemplateKindWarningLetter, NumberingTemplate: "{{seq}}/SP/{{year}}",
		EntityType: "warning_letter", EntityID: entityID, AcademicYearID: year.ID, IssuerUserID: issuer.ID,
		BuiltinHTML: "<html><body>{{.letter_number}}</body></html>",
	})
	require.NoError(t, err)
	require.NotEmpty(t, result.Number)

	logs := auditLogsFor(t, pg.AdminPool, tenantRow.ID, entityID)
	require.Len(t, logs, 1, "IssueDocument must write exactly one audit_logs row")
	require.Equal(t, "document.issue", logs[0].Action)
	require.Equal(t, "warning_letter", logs[0].EntityType)
}
