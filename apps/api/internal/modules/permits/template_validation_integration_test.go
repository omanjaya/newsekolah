package permits

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestUpdateTemplateRejectsInvalidBodyAndKeepsTheOldOne covers the save-
// time check on the update path: a body the renderer could not parse is
// refused, and the stored body stays the last valid one, so letters of
// that kind keep issuing.
func TestUpdateTemplateRejectsInvalidBodyAndKeepsTheOldOne(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "permits-template-" + uuid.NewString(), Name: "Template Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	mod := Register(Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: service.Config{DocumentSigningKey: []byte("a-test-signing-key")},
	})

	const validBody = "<p>Surat izin untuk {{.student_name}}</p>"
	created, err := mod.Service.CreateTemplate(ctx, domain.Template{
		TenantID: tenantRow.ID, Kind: domain.TemplateKindLeaveLetter, Name: "Surat izin", Body: validBody,
	})
	require.NoError(t, err)

	_, err = mod.Service.UpdateTemplate(ctx, tenantRow.ID, created.ID, "Surat izin", "<p>Surat izin untuk {{.student_name", nil, uuid.NullUUID{})
	require.ErrorIs(t, err, domain.ErrTemplateInvalid)

	templates, err := mod.Service.ListTemplates(ctx, tenantRow.ID)
	require.NoError(t, err)
	require.Len(t, templates, 1)
	require.Equal(t, validBody, templates[0].Body)

	const newBody = "<p>Izin untuk {{.student_name}} kelas {{.class_name}}</p>"
	updated, err := mod.Service.UpdateTemplate(ctx, tenantRow.ID, created.ID, "Surat izin", newBody, nil, uuid.NullUUID{})
	require.NoError(t, err)
	require.Equal(t, newBody, updated.Body)
}
