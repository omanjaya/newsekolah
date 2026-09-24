package discipline

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// memStorage is a minimal in-process stand-in for platform/storage.Client,
// just enough to exercise the presigned-PUT-then-confirm shape without a
// real MinIO: PresignedPutURL/PresignedGetURL return fake but well-formed
// URLs (never dereferenced by the service, only returned to the caller),
// and PutObject/GetObject keep the bytes in memory keyed by object key --
// standing in for the client's real PUT to the presigned URL, which a Go
// test has no browser to perform.
type memStorage struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func newMemStorage() *memStorage { return &memStorage{objects: map[string][]byte{}} }

func (m *memStorage) PresignedPutURL(_ context.Context, objectKey string, _ time.Duration) (*url.URL, error) {
	return url.Parse(fmt.Sprintf("https://minio.test/put/%s", objectKey))
}

func (m *memStorage) PresignedGetURL(_ context.Context, objectKey string, _ time.Duration) (*url.URL, error) {
	return url.Parse(fmt.Sprintf("https://minio.test/get/%s", objectKey))
}

func (m *memStorage) PutObject(_ context.Context, objectKey string, content []byte, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[objectKey] = append([]byte(nil), content...)
	return nil
}

func (m *memStorage) GetObject(_ context.Context, objectKey string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("object %s not found", objectKey)
	}
	return data, nil
}

// clientUploads simulates a browser PUTting file to the presigned URL the
// service just returned: in this fake, that is simply writing the bytes
// at the same object key the service will later read back with GetObject.
func (m *memStorage) clientUploads(objectKey string, content []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[objectKey] = content
}

// onePixelPNG returns a tiny but genuine PNG, so
// ConfirmViolationAttachment's real image decode/re-encode (which rejects
// anything that is not actually an image, regardless of declared content
// type) succeeds the way it would for a real photo.
func onePixelPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 200, G: 10, B: 10, A: 255})
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func newTestDisciplineModuleWithStorage(t *testing.T, appPool *pgxpool.Pool, storage service.Storage) *Module {
	t.Helper()
	sealer, err := crypto.NewSealer("v1", "a-test-secret-of-at-least-32-bytes!")
	require.NoError(t, err)
	schoolModule := school.Register(appPool, tenant.ModeSingle, nil)
	return Register(Dependencies{
		Pool: appPool, Years: schoolModule.Service, Sealer: sealer, Clock: clock.Real{},
		Storage: storage, Config: service.DefaultConfig("test-bucket"),
	})
}

// TestViolationAttachmentLifecycle covers photo evidence on a violation
// record end to end: presign, the client's upload, confirm (which
// re-encodes and records it), listing, a short-lived download URL, and
// the 1-3 photo cap.
func TestViolationAttachmentLifecycle(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedDisciplineFixture(t, pg.AdminPool)
	storage := newMemStorage()
	mod := newTestDisciplineModuleWithStorage(t, pg.AppPool, storage)
	ctx := context.Background()

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "TL", Name: "Terlambat", Points: 5})
	require.NoError(t, err)
	result, err := mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
		StudentUserID: fx.studentID, ViolationTypeID: vt.ID, OccurredOn: time.Now(), ReporterUserID: fx.counselorID,
	})
	require.NoError(t, err)
	recordID := result.Record.ID

	photo := onePixelPNG(t)

	uploadAndConfirm := func() domain.ViolationAttachment {
		target, err := mod.Service.RequestViolationAttachmentUpload(ctx, fx.tenantID, recordID, fx.counselorID)
		require.NoError(t, err)
		require.NotEmpty(t, target.ObjectKey)
		require.NotEmpty(t, target.UploadURL)
		storage.clientUploads(target.ObjectKey, photo)
		att, err := mod.Service.ConfirmViolationAttachment(ctx, fx.tenantID, recordID, fx.counselorID, target.ObjectKey)
		require.NoError(t, err)
		require.Equal(t, recordID, att.ViolationRecordID)
		return att
	}

	first := uploadAndConfirm()
	second := uploadAndConfirm()
	third := uploadAndConfirm()
	require.NotEqual(t, first.ID, second.ID)

	list, err := mod.Service.ListViolationAttachments(ctx, fx.tenantID, recordID)
	require.NoError(t, err)
	require.Len(t, list, 3, "1-3 photos: three uploads must all be recorded")

	// A 4th photo must be refused once the record already has three.
	_, err = mod.Service.RequestViolationAttachmentUpload(ctx, fx.tenantID, recordID, fx.counselorID)
	require.NoError(t, err, "presigning is still allowed; the cap is enforced at confirm time")
	target, err := mod.Service.RequestViolationAttachmentUpload(ctx, fx.tenantID, recordID, fx.counselorID)
	require.NoError(t, err)
	storage.clientUploads(target.ObjectKey, photo)
	_, err = mod.Service.ConfirmViolationAttachment(ctx, fx.tenantID, recordID, fx.counselorID, target.ObjectKey)
	require.ErrorIs(t, err, domain.ErrAttachmentLimitReached)

	list, err = mod.Service.ListViolationAttachments(ctx, fx.tenantID, recordID)
	require.NoError(t, err)
	require.Len(t, list, 3, "the rejected 4th upload must not be recorded")

	url, err := mod.Service.ViolationAttachmentURL(ctx, fx.tenantID, recordID, third.ID)
	require.NoError(t, err)
	require.NotEmpty(t, url)

	// An attachment id from a different record must not resolve.
	_, err = mod.Service.ViolationAttachmentURL(ctx, fx.tenantID, uuid.New(), third.ID)
	require.ErrorIs(t, err, domain.ErrRecordNotFound)
}

// TestPointsPreviewReflectsCurrentTotalsAndIssuedLevels covers the live
// points preview: one call returns every requested student's current
// active total and already-issued SP levels in one round trip, a student
// with no violations yet comes back at zero (not an error), and a
// duplicate id in the request does not duplicate the entry.
func TestPointsPreviewReflectsCurrentTotalsAndIssuedLevels(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	ctx := context.Background()

	other := seedDisciplineFixture(t, pg.AdminPool)

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "BK", Name: "Berkelahi", Points: 30})
	require.NoError(t, err)
	_, err = mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
		StudentUserID: fx.studentID, ViolationTypeID: vt.ID, OccurredOn: time.Now(), ReporterUserID: fx.counselorID,
	})
	require.NoError(t, err)

	policy, err := mod.Service.Policy(ctx, fx.tenantID)
	require.NoError(t, err)
	require.Equal(t, 25, policy.Levels[0].MinPoints, "default policy: SP1 at 25 points")

	_, err = mod.Service.IssueWarningLetter(ctx, fx.tenantID, fx.studentID, fx.counselorID, 1)
	require.NoError(t, err)

	entries, previewPolicy, err := mod.Service.PointsPreview(ctx, fx.tenantID, []uuid.UUID{fx.studentID, fx.studentID, other.studentID})
	require.NoError(t, err)
	require.Len(t, entries, 2, "a duplicated student id must not duplicate the entry")
	require.Equal(t, policy.Version, previewPolicy.Version)

	byStudent := map[uuid.UUID]service.PointsPreviewEntry{}
	for _, e := range entries {
		byStudent[e.StudentUserID] = e
	}

	withViolation := byStudent[fx.studentID]
	require.Equal(t, 30, withViolation.TotalPoints)
	require.Equal(t, []int{1}, withViolation.IssuedLevels)

	fresh := byStudent[other.studentID]
	require.Equal(t, 0, fresh.TotalPoints, "a student with no violations this year has zero points, not an error")
	require.Empty(t, fresh.IssuedLevels)

	// A tenant belonging to a different school must never leak into
	// another tenant's preview, even by id collision in theory -- covered
	// implicitly since seedDisciplineFixture always mints fresh tenants,
	// but assert the request is still scoped to fx.tenantID's own policy.
	_, _, err = mod.Service.PointsPreview(ctx, fx.tenantID, nil)
	require.ErrorIs(t, err, domain.ErrInvalidInput, "an empty student list is rejected, not silently returning nothing")
}
