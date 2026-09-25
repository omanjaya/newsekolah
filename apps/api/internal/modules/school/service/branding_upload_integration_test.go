package service_test

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// memStorage is a minimal in-process stand-in for platform/storage.Client
// against service.Storage's narrow interface, the same pattern
// discipline/violation_extras_integration_test.go's memStorage uses:
// Presigned*URL return fake but well-formed URLs (never dereferenced by
// the service, only handed back to the caller), and DownloadBounded /
// RemoveObject work against an in-memory object map -- standing in for a
// client's real PUT to the presigned URL, which a Go test has no browser
// to perform, and for MinIO's real size enforcement.
type memStorage struct {
	mu      sync.Mutex
	bucket  string
	objects map[string][]byte
	removed map[string]bool
}

func newMemStorage(bucket string) *memStorage {
	return &memStorage{bucket: bucket, objects: map[string][]byte{}, removed: map[string]bool{}}
}

func (m *memStorage) Bucket() string { return m.bucket }

func (m *memStorage) PresignedPutURL(_ context.Context, objectKey string, _ time.Duration) (*url.URL, error) {
	return url.Parse(fmt.Sprintf("https://minio.test/put/%s", objectKey))
}

func (m *memStorage) PresignedGetURL(_ context.Context, objectKey string, _ time.Duration) (*url.URL, error) {
	return url.Parse(fmt.Sprintf("https://minio.test/get/%s", objectKey))
}

func (m *memStorage) PresignedGetURLAsAttachment(_ context.Context, objectKey string, _ time.Duration, contentType, filename string) (*url.URL, error) {
	return url.Parse(fmt.Sprintf("https://minio.test/get-attachment/%s?type=%s&filename=%s",
		objectKey, url.QueryEscape(contentType), url.QueryEscape(filename)))
}

// DownloadBounded mirrors platform/storage.Client.DownloadBounded's
// contract: ErrTooLarge when the stored object exceeds maxBytes, so
// confirmBrandingUpload's size-limit branch is exercised the same way it
// is against the real MinIO client.
func (m *memStorage) DownloadBounded(_ context.Context, objectKey string, maxBytes int64) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("object %s not found", objectKey)
	}
	if int64(len(data)) > maxBytes {
		return nil, storage.ErrTooLarge
	}
	return data, nil
}

func (m *memStorage) RemoveObject(_ context.Context, objectKey string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, objectKey)
	m.removed[objectKey] = true
	return nil
}

// clientUploads simulates a browser PUTting a file to the presigned URL
// the service just returned.
func (m *memStorage) clientUploads(objectKey string, content []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[objectKey] = content
}

func (m *memStorage) wasRemoved(objectKey string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.removed[objectKey]
}

// onePixelPNG returns a tiny but genuine PNG, so the real
// http.DetectContentType sniff in confirmBrandingUpload identifies it as
// image/png the way it would a real logo/favicon export.
func onePixelPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 10, G: 200, B: 10, A: 255})
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func newBrandingUploadService(pg dbtest.Postgres, st service.Storage) *service.Service {
	return service.New(pg.AppPool, repository.New(pg.AppPool), tenant.ModeSingle, st)
}

// assetRow reads back one assets row by object key directly (AdminPool
// bypasses RLS, same convention dbtest.Postgres documents for fixture
// setup/verification), so a test can assert the kind/visibility a confirm
// step actually persisted -- the exact columns commit 0967189 fixed after
// they violated the assets table's check constraints.
func assetRow(t *testing.T, pool *pgxpool.Pool, objectKey string) (kind, visibility string) {
	t.Helper()
	err := pool.QueryRow(context.Background(),
		`select kind, visibility from assets where object_key = $1`, objectKey,
	).Scan(&kind, &visibility)
	require.NoError(t, err)
	return kind, visibility
}

// --- logo confirm -----------------------------------------------------------

// TestConfirmLogoUploadStoresBrandingAsset covers the full happy path:
// request a presigned PUT, the client's upload, confirm, and that
// Branding() then returns a logo_url -- the asset row must carry
// kind=branding/visibility=tenant_public (the assets table's check
// constraints; a mismatch fails the insert, which the pre-fix code did
// not have a test to catch).
func TestConfirmLogoUploadStoresBrandingAsset(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-logo-confirm")
	actorID := uuid.New()
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	target, err := svc.RequestLogoUpload(ctx, tenantID)
	require.NoError(t, err)
	require.NotEmpty(t, target.ObjectKey)
	require.NotEmpty(t, target.UploadURL)
	require.Contains(t, target.ObjectKey, fmt.Sprintf("branding/%s/logo/", tenantID))

	photo := onePixelPNG(t)
	st.clientUploads(target.ObjectKey, photo)

	branding, err := svc.ConfirmLogoUpload(ctx, tenantID, actorID, target.ObjectKey)
	require.NoError(t, err)
	assert.NotEmpty(t, branding.LogoURL, "Branding() must return a logo_url once a logo is confirmed")

	kind, visibility := assetRow(t, pg.AdminPool, target.ObjectKey)
	assert.Equal(t, "branding", kind)
	assert.Equal(t, "tenant_public", visibility)

	settings, err := repository.New(pg.AdminPool).ListBrandingSettings(ctx, tenantID)
	require.NoError(t, err)
	assert.Equal(t, target.ObjectKey, settings["branding.logo_object_key"])
	assert.Equal(t, "image/png", settings["branding.logo_mime"])
}

// TestConfirmFaviconUploadStoresBrandingAsset is
// TestConfirmLogoUploadStoresBrandingAsset's favicon equivalent -- a
// separate settings key/object prefix, same asset table constraints.
func TestConfirmFaviconUploadStoresBrandingAsset(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-favicon-confirm")
	actorID := uuid.New()
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	target, err := svc.RequestFaviconUpload(ctx, tenantID)
	require.NoError(t, err)
	require.Contains(t, target.ObjectKey, fmt.Sprintf("branding/%s/favicon/", tenantID))

	icon := onePixelPNG(t)
	st.clientUploads(target.ObjectKey, icon)

	branding, err := svc.ConfirmFaviconUpload(ctx, tenantID, actorID, target.ObjectKey)
	require.NoError(t, err)
	assert.NotEmpty(t, branding.FaviconURL)

	kind, visibility := assetRow(t, pg.AdminPool, target.ObjectKey)
	assert.Equal(t, "branding", kind)
	assert.Equal(t, "tenant_public", visibility)
}

// --- confirm rejections ------------------------------------------------------

// TestConfirmLogoUploadRejectsWrongOwnerPrefix proves an object key that
// does not start with this tenant's own branding/<id>/logo/ prefix is
// refused before ever touching storage -- one tenant must not be able to
// confirm another tenant's (or another asset type's) uploaded object as
// its own logo.
func TestConfirmLogoUploadRejectsWrongOwnerPrefix(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-wrong-owner")
	otherTenantID := uuid.New()
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	foreignKey := fmt.Sprintf("branding/%s/logo/%s", otherTenantID, uuid.New())
	st.clientUploads(foreignKey, onePixelPNG(t))

	_, err := svc.ConfirmLogoUpload(ctx, tenantID, uuid.New(), foreignKey)
	require.ErrorIs(t, err, domain.ErrUploadObjectNotOwned)

	// A favicon-prefixed key must also be refused for a logo confirm, not
	// just a different tenant.
	wrongType := fmt.Sprintf("branding/%s/favicon/%s", tenantID, uuid.New())
	st.clientUploads(wrongType, onePixelPNG(t))
	_, err = svc.ConfirmLogoUpload(ctx, tenantID, uuid.New(), wrongType)
	require.ErrorIs(t, err, domain.ErrUploadObjectNotOwned)
}

// TestConfirmLogoUploadRejectsTooLarge proves an object over
// domain.BrandingLogoMaxBytes is refused with ErrUploadTooLarge (mapped
// from storage.ErrTooLarge, DownloadBounded's own limit signal) rather
// than being downloaded and stored regardless of size.
func TestConfirmLogoUploadRejectsTooLarge(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-too-large")
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	target, err := svc.RequestLogoUpload(ctx, tenantID)
	require.NoError(t, err)

	oversized := make([]byte, domain.BrandingLogoMaxBytes+1)
	st.clientUploads(target.ObjectKey, oversized)

	_, err = svc.ConfirmLogoUpload(ctx, tenantID, uuid.New(), target.ObjectKey)
	require.ErrorIs(t, err, domain.ErrUploadTooLarge)
}

// TestConfirmFaviconUploadRejectsTooLarge proves the favicon confirm path
// enforces its own, tighter BrandingFaviconMaxBytes -- a size that would
// pass the logo limit but not the favicon one.
func TestConfirmFaviconUploadRejectsTooLarge(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-favicon-too-large")
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	target, err := svc.RequestFaviconUpload(ctx, tenantID)
	require.NoError(t, err)

	oversized := make([]byte, domain.BrandingFaviconMaxBytes+1)
	require.Less(t, len(oversized), int(domain.BrandingLogoMaxBytes)+1, "must still fit the logo limit, to prove this is the favicon-specific check")
	st.clientUploads(target.ObjectKey, oversized)

	_, err = svc.ConfirmFaviconUpload(ctx, tenantID, uuid.New(), target.ObjectKey)
	require.ErrorIs(t, err, domain.ErrUploadTooLarge)
}

// TestConfirmLogoUploadRejectsInvalidType proves content that does not
// sniff as one of domain.AllowedBrandingImageTypes is refused and the
// rejected object is removed from storage rather than left orphaned.
func TestConfirmLogoUploadRejectsInvalidType(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-invalid-type")
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	target, err := svc.RequestLogoUpload(ctx, tenantID)
	require.NoError(t, err)
	st.clientUploads(target.ObjectKey, []byte("this is plain text, not an image"))

	_, err = svc.ConfirmLogoUpload(ctx, tenantID, uuid.New(), target.ObjectKey)
	require.ErrorIs(t, err, domain.ErrUploadInvalidType)
	assert.True(t, st.wasRemoved(target.ObjectKey), "a rejected upload must be removed from storage, not left orphaned")
}

// TestConfirmLogoUploadRejectsMaliciousSVG proves an SVG containing a
// <script> element -- stored XSS if a browser ever opens the logo URL
// directly -- is refused by domain.ValidateSVGUpload even though its
// sniffed content type (image/svg+xml) is otherwise allowed, and the
// object is removed from storage.
func TestConfirmLogoUploadRejectsMaliciousSVG(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-malicious-svg")
	st := newMemStorage("test-bucket")
	svc := newBrandingUploadService(pg, st)
	ctx := context.Background()

	target, err := svc.RequestLogoUpload(ctx, tenantID)
	require.NoError(t, err)
	malicious := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>`)
	st.clientUploads(target.ObjectKey, malicious)

	_, err = svc.ConfirmLogoUpload(ctx, tenantID, uuid.New(), target.ObjectKey)
	require.ErrorIs(t, err, domain.ErrUploadInvalidType)
	assert.True(t, st.wasRemoved(target.ObjectKey), "a malicious SVG must be removed from storage, not left orphaned")
}

// TestConfirmLogoUploadWithStorageNilReturnsErrUploadNotConfigured proves
// a service built without storage (S3 not configured, e.g. local dev
// without MinIO) degrades to ErrUploadNotConfigured rather than a nil
// pointer panic -- module.go's Register must hand service.New a
// genuinely nil service.Storage in that case, not a non-nil interface
// boxing a nil *storage.Client (see module.go's comment on Register).
func TestConfirmLogoUploadWithStorageNilReturnsErrUploadNotConfigured(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "branding-storage-nil")
	svc := newBrandingUploadService(pg, nil)
	ctx := context.Background()

	_, err := svc.RequestLogoUpload(ctx, tenantID)
	require.ErrorIs(t, err, domain.ErrUploadNotConfigured)

	_, err = svc.ConfirmLogoUpload(ctx, tenantID, uuid.New(), "branding/x/logo/y")
	require.ErrorIs(t, err, domain.ErrUploadNotConfigured)
}

// --- assets table constraints across every module -----------------------

// TestAssetKindVisibilityPairsSatisfyTableConstraints inserts one assets
// row for every (kind, visibility) combination a CreateAsset(Record)
// caller in this codebase actually uses (grep CreateAsset callers under
// internal/modules), so a constraint mismatch like the one commit 0967189
// fixed for school/branding is caught for every module, not just this
// one. The assets table's check constraints (migration
// 0001_platform_core.up.sql) are the single source of truth this asserts
// against.
func TestAssetKindVisibilityPairsSatisfyTableConstraints(t *testing.T) {
	pg := dbtest.Start(t)
	repo := repository.New(pg.AppPool)
	ctx := context.Background()

	pairs := []struct {
		module, kind, visibility string
	}{
		{"identity (avatar)", "avatar", "private"},
		{"school (branding logo/favicon)", "branding", "tenant_public"},
		{"permits (issued documents)", "document", "private"},
		{"permits/discipline (evidence photos)", "evidence", "private"},
		{"library (book covers)", "cover", "tenant_public"},
	}

	for _, p := range pairs {
		t.Run(p.module, func(t *testing.T) {
			slug := "asset-pair-" + strings.ReplaceAll(p.kind+"-"+p.visibility, "_", "-")
			tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, slug)
			objectKey := fmt.Sprintf("test/%s/%s/%s", p.kind, p.visibility, uuid.New())

			err := database.WithTenantTx(ctx, pg.AppPool, tenantID, func(ctx context.Context) error {
				_, err := repo.CreateAssetRecord(ctx, service.NewAsset{
					TenantID: tenantID, Bucket: "test-bucket", ObjectKey: objectKey,
					Mime: "application/octet-stream", SizeBytes: 1, SHA256: fmt.Sprintf("%064x", 1),
					Kind: p.kind, Visibility: p.visibility, CreatedBy: uuid.New(),
				})
				return err
			})
			require.NoError(t, err, "kind=%s visibility=%s must satisfy the assets table's check constraints", p.kind, p.visibility)

			kind, visibility := assetRow(t, pg.AdminPool, objectKey)
			assert.Equal(t, p.kind, kind)
			assert.Equal(t, p.visibility, visibility)
		})
	}
}
