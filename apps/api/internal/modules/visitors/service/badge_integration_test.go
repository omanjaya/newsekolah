package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// fakeBadgeIssuer stands in for the permits pipeline: it numbers the
// badge and stores a real assets row (the visit row references it), and
// hands back a URL naming the asset it is asked for.
type fakeBadgeIssuer struct {
	admin *pgxpool.Pool
	n     int
}

func (f *fakeBadgeIssuer) IssueVisitorBadge(ctx context.Context, tenantID uuid.UUID, in service.BadgeDocument) (service.IssuedBadge, error) {
	f.n++
	asset, err := db.New(f.admin).CreateAsset(ctx, db.CreateAssetParams{
		TenantID: tenantID, Bucket: "test", ObjectKey: "badges/" + in.VisitID.String() + ".pdf", Mime: "application/pdf",
		SizeBytes: 1, Sha256: "x", Kind: "document", Visibility: "private",
	})
	if err != nil {
		return service.IssuedBadge{}, err
	}
	return service.IssuedBadge{Number: "TAMU-1/XI/2026", AssetID: uuid.NullUUID{UUID: asset.ID, Valid: true}}, nil
}

func (f *fakeBadgeIssuer) DocumentURL(_ context.Context, _ uuid.UUID, assetID uuid.UUID) (string, error) {
	return "https://files.test/" + assetID.String(), nil
}

// TestCheckInStoresTheBadge pins the bug where the badge number and PDF
// existed only in the check-in response: the board, the visit detail and
// the badge download all read them back from the stored visit.
func TestCheckInStoresTheBadge(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-badge-"+uuid.NewString())
	docs := &fakeBadgeIssuer{admin: pg.AdminPool}
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), stubYearsVisitors{}, docs, nil, nil, nil, nil, clock.Real{})

	visit, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "Budi Santoso", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)
	require.Equal(t, "TAMU-1/XI/2026", visit.BadgeNumber)
	require.True(t, visit.BadgeAssetID.Valid)

	stored, err := svc.GetVisit(ctx, tenantID, visit.ID)
	require.NoError(t, err)
	require.Equal(t, "TAMU-1/XI/2026", stored.BadgeNumber, "the badge number is stored on the visit")
	require.Equal(t, visit.BadgeAssetID, stored.BadgeAssetID)

	board, err := svc.Board(ctx, tenantID)
	require.NoError(t, err)
	require.Len(t, board, 1)
	require.Equal(t, "TAMU-1/XI/2026", board[0].Visit.BadgeNumber, "the gate board shows the badge number")

	url, err := svc.BadgeURL(ctx, tenantID, visit.ID)
	require.NoError(t, err, "the badge PDF can be downloaded after check-in")
	require.Equal(t, "https://files.test/"+visit.BadgeAssetID.UUID.String(), url)
}
