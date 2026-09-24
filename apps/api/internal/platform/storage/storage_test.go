package storage

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Presigning (PresignedPutObject/PresignedGetObject) is pure local SigV4
// signing against the client's own configured endpoint -- no network call,
// as long as a Region is set (see DefaultRegion) -- so these run as plain
// unit tests with fake credentials, no MinIO server required.

func TestPresignedPutURL_UsesInternalEndpointWhenNoPublicEndpointConfigured(t *testing.T) {
	client, err := NewClient(Config{
		Endpoint:  "minio:9000",
		Bucket:    "newsekolah",
		AccessKey: "test-access",
		SecretKey: "test-secret",
		UseSSL:    false,
	})
	require.NoError(t, err)

	u, err := client.PresignedPutURL(context.Background(), "avatars/some-uuid.jpg", 5*time.Minute)
	require.NoError(t, err)

	require.Equal(t, "minio:9000", u.Host)
	require.Equal(t, "http", u.Scheme)
	// Path-style: /<bucket>/<key>, not <bucket>.minio:9000/<key>.
	require.Equal(t, "/newsekolah/avatars/some-uuid.jpg", u.Path)
	require.Contains(t, u.RawQuery, "X-Amz-Signature=")
}

func TestPresignedPutURL_UsesPublicEndpointWhenConfigured(t *testing.T) {
	client, err := NewClient(Config{
		Endpoint:       "minio:9000",
		Bucket:         "newsekolah",
		AccessKey:      "test-access",
		SecretKey:      "test-secret",
		UseSSL:         false,
		PublicEndpoint: "https://sion.nouma.id",
	})
	require.NoError(t, err)

	u, err := client.PresignedPutURL(context.Background(), "avatars/some-uuid.jpg", 5*time.Minute)
	require.NoError(t, err)

	require.Equal(t, "sion.nouma.id", u.Host)
	require.Equal(t, "https", u.Scheme)
	// Path-style so the shared system Caddy's /newsekolah/* route
	// (infra/README.md "Shared system Caddy (VPS)") matches, and so the
	// browser's actual request path is what SigV4 signed.
	require.Equal(t, "/newsekolah/avatars/some-uuid.jpg", u.Path)
	require.Contains(t, u.RawQuery, "X-Amz-Signature=")

	// Never the internal Docker-only host, which a browser cannot reach.
	require.NotContains(t, u.String(), "minio:9000")
}

func TestPresignedGetURL_UsesPublicEndpointWhenConfigured(t *testing.T) {
	client, err := NewClient(Config{
		Endpoint:       "minio:9000",
		Bucket:         "newsekolah",
		AccessKey:      "test-access",
		SecretKey:      "test-secret",
		UseSSL:         false,
		PublicEndpoint: "https://sion.nouma.id",
	})
	require.NoError(t, err)

	u, err := client.PresignedGetURL(context.Background(), "letters/sp-1.pdf", 5*time.Minute)
	require.NoError(t, err)

	require.Equal(t, "sion.nouma.id", u.Host)
	require.Equal(t, "/newsekolah/letters/sp-1.pdf", u.Path)
}

func TestPresignedGetURLAsAttachment_UsesPublicEndpointWhenConfigured(t *testing.T) {
	client, err := NewClient(Config{
		Endpoint:       "minio:9000",
		Bucket:         "newsekolah",
		AccessKey:      "test-access",
		SecretKey:      "test-secret",
		UseSSL:         false,
		PublicEndpoint: "https://sion.nouma.id",
	})
	require.NoError(t, err)

	u, err := client.PresignedGetURLAsAttachment(context.Background(), "letters/sp-1.pdf", 5*time.Minute, "application/pdf", "sp-1.pdf")
	require.NoError(t, err)

	require.Equal(t, "sion.nouma.id", u.Host)
	require.True(t, strings.Contains(u.RawQuery, "response-content-disposition=attachment"))
}

func TestNewClient_RejectsInvalidPublicEndpoint(t *testing.T) {
	_, err := NewClient(Config{
		Endpoint:       "minio:9000",
		Bucket:         "newsekolah",
		AccessKey:      "test-access",
		SecretKey:      "test-secret",
		PublicEndpoint: "not-a-url",
	})
	require.Error(t, err)
}

func TestNewClient_DefaultsRegionWhenEmpty(t *testing.T) {
	// A missing Region must not make presigning attempt a network call
	// (GetBucketLocation) -- if it did, this test would hang or fail
	// against the fake, unreachable "minio:9000" host instead of
	// returning a signed URL immediately.
	client, err := NewClient(Config{
		Endpoint:  "minio:9000",
		Bucket:    "newsekolah",
		AccessKey: "test-access",
		SecretKey: "test-secret",
	})
	require.NoError(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	u, err := client.PresignedPutURL(ctx, "k", 5*time.Minute)
	require.NoError(t, err)
	require.Contains(t, u.RawQuery, "X-Amz-Signature=")
}
