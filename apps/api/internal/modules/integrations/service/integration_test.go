package service_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type allPerms struct{}

func (allPerms) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return authz.NewSet(authz.PermViewAnnouncements, authz.PermManageIntegrations), nil
}

type noopJobs struct{}

func (noopJobs) InsertTx(context.Context, pgx.Tx, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	return &rivertype.JobInsertResult{}, nil
}

type publicResolver struct{}

func (publicResolver) LookupIPs(context.Context, string) ([]string, error) {
	return []string{"93.184.216.34"}, nil
}

type integrationsFixture struct {
	pg       dbtest.Postgres
	svc      *service.Service
	repo     *repository.Repository
	sealer   *crypto.Sealer
	tenantID uuid.UUID
	userID   uuid.UUID
}

func newIntegrationsFixture(t *testing.T) integrationsFixture {
	t.Helper()
	pg := dbtest.Start(t)
	ctx := context.Background()
	var tenantID, userID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		 values ($1,'Test School','sma','UTC','id','active','default') returning id`,
		"integrations-"+uuid.NewString()[:8]).Scan(&tenantID))
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into users (tenant_id,username,email,password_hash,name,status,locale)
		 values ($1,'integrations-admin','integrations-admin@example.test','x','Admin','active','id') returning id`,
		tenantID).Scan(&userID))
	sealer, err := crypto.NewSealer("test", "integrations-test-secret-32-characters-min")
	require.NoError(t, err)
	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, repo, allPerms{}, sealer, noopJobs{}, nil, publicResolver{})
	return integrationsFixture{pg: pg, svc: svc, repo: repo, sealer: sealer, tenantID: tenantID, userID: userID}
}

// TestCreateKey_WithoutAllowlistPersists covers the web form, which never
// sends ip_allowlist: the key must be stored with an empty allowlist
// instead of a NULL that violates the NOT NULL column (a 500 before).
func TestCreateKey_WithoutAllowlistPersists(t *testing.T) {
	f := newIntegrationsFixture(t)
	created, err := f.svc.CreateKey(context.Background(), f.tenantID, f.userID, service.CreateKeyInput{
		Name: "Integrasi Dapodik", Permissions: []string{authz.PermViewAnnouncements},
	})
	require.NoError(t, err)
	require.NotEmpty(t, created.Token)
	require.NotNil(t, created.Key.IPAllowlist)
	require.Empty(t, created.Key.IPAllowlist)

	keys, err := f.svc.ListKeys(context.Background(), f.tenantID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	require.Empty(t, keys[0].IPAllowlist)
}

// TestRegisterEndpoint_ReturnsVerifiableSecret proves the secret handed
// back once at registration is the key every delivery is signed with, so
// a receiver can verify X-Newsekolah-Signature.
func TestRegisterEndpoint_ReturnsVerifiableSecret(t *testing.T) {
	f := newIntegrationsFixture(t)
	ctx := context.Background()
	registered, err := f.svc.RegisterEndpoint(ctx, f.tenantID, f.userID, service.RegisterEndpointInput{
		URL: "https://example.com/hook", EventTypes: []string{service.EventCatalog[0]},
	})
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(registered.SigningSecret, domain.SigningSecretPrefix))
	require.Greater(t, len(registered.SigningSecret), len(domain.SigningSecretPrefix)+40)

	var stored []byte
	require.NoError(t, database.WithTenantTx(ctx, f.pg.AppPool, f.tenantID, func(ctx context.Context) error {
		row, err := f.repo.GetEndpoint(ctx, f.tenantID, registered.Endpoint.ID)
		if err != nil {
			return err
		}
		stored, err = f.sealer.Open(row.Ciphertext)
		return err
	}))

	body := []byte(`{"event":"test"}`)
	ts := time.Now().Unix()
	signature := domain.SignPayload(stored, ts, body)
	require.True(t, domain.VerifySignature([]byte(registered.SigningSecret), ts, body, signature),
		"a receiver using the shown secret verbatim must verify a signature made with the stored key")
}
