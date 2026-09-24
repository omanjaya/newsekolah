// Package storage wraps an S3-compatible object store (MinIO self-hosted,
// or S3/R2 for SaaS). All access to an uploaded file goes through a
// short-lived signed URL issued after an authorization check
// (docs/08-security.md section 6); nothing is ever served from a public
// directory. No module uses this yet in this phase (no upload endpoint
// exists), but the client is real and connects to the dev MinIO started by
// `make infra-up`.
package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	// DefaultUploadURLTTL matches docs/08-security.md section 6: signed
	// URLs are short-lived.
	DefaultUploadURLTTL = 5 * time.Minute

	// DefaultRegion is used whenever Config.Region is empty. minio-go calls
	// GetBucketLocation against the target endpoint to discover the region
	// when none is configured; setting one explicitly avoids that extra
	// network round trip on every presign (and avoids it ever needing to
	// reach the *public* endpoint, which a server process may not be able
	// to resolve or route to at all). "us-east-1" is also MinIO's own
	// default bucket region, so this matches what EnsureBucket creates.
	DefaultRegion = "us-east-1"
)

type Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	// UseSSL should be true for any endpoint that is not the local dev
	// MinIO container.
	UseSSL bool
	// PublicEndpoint, when set, is the absolute URL (scheme + host, e.g.
	// "https://sion.nouma.id") that presigned URLs handed to browsers are
	// signed against, instead of Endpoint. Every other operation (stat,
	// get, put, delete, bucket checks) keeps using Endpoint -- only
	// PresignedPutURL, PresignedGetURL and PresignedGetURLAsAttachment are
	// affected. This exists because Endpoint is typically a
	// Docker-internal host (e.g. "minio:9000") that only the api/worker
	// containers can reach, while a presigned URL must be reachable by the
	// browser that receives it. Left empty, behaviour is unchanged: both
	// server-side operations and presigning use Endpoint, exactly as
	// before this field existed.
	PublicEndpoint string
	// Region avoids minio-go's implicit GetBucketLocation call (which,
	// absent an explicit region, one of the clients would otherwise make
	// against PublicEndpoint -- an origin fronted by a reverse proxy that
	// may not implement that call the way a bare MinIO endpoint does).
	// Defaults to DefaultRegion when empty.
	Region string
}

type Client struct {
	// mc performs every operation except presigning: stat, get, put,
	// delete, bucket existence/creation. Always built from Endpoint.
	mc *minio.Client
	// presignMC is used only by PresignedPutURL, PresignedGetURL and
	// PresignedGetURLAsAttachment. It is the same client as mc when
	// PublicEndpoint is empty, and a second client built from
	// PublicEndpoint otherwise -- see Config.PublicEndpoint.
	presignMC *minio.Client
	bucket    string
}

func NewClient(cfg Config) (*Client, error) {
	region := cfg.Region
	if region == "" {
		region = DefaultRegion
	}

	mc, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: region,
		// Path-style ("host/bucket/key") rather than virtual-hosted-style
		// ("bucket.host/key"): Endpoint is a bare MinIO host, never
		// AWS S3, and a virtual-hosted URL would require DNS for
		// "<bucket>.<host>", which nothing provisions here.
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	presignMC := mc
	if cfg.PublicEndpoint != "" {
		publicHost, publicSecure, parseErr := parsePublicEndpoint(cfg.PublicEndpoint)
		if parseErr != nil {
			return nil, fmt.Errorf("public endpoint: %w", parseErr)
		}
		presignMC, err = minio.New(publicHost, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
			Secure: publicSecure,
			Region: region,
			// Path-style so the signed URL looks like
			// https://<public-host>/<bucket>/<key>?X-Amz-... -- the shared
			// system Caddy in front of the public endpoint routes exactly
			// that path prefix to MinIO (infra/README.md "Shared system
			// Caddy (VPS)"), and SigV4 signs this path into the request,
			// so it must match what the browser actually sends.
			BucketLookup: minio.BucketLookupPath,
		})
		if err != nil {
			return nil, fmt.Errorf("create public presign client: %w", err)
		}
	}

	return &Client{mc: mc, presignMC: presignMC, bucket: cfg.Bucket}, nil
}

// parsePublicEndpoint splits an absolute URL like "https://sion.nouma.id"
// into the host[:port] minio.New expects and whether it is TLS.
func parsePublicEndpoint(raw string) (host string, secure bool, err error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", false, fmt.Errorf("parse %q: %w", raw, err)
	}
	if u.Scheme == "" || u.Host == "" {
		return "", false, fmt.Errorf("%q must be an absolute URL (scheme and host), e.g. https://sion.nouma.id", raw)
	}
	return u.Host, u.Scheme == "https", nil
}

// Bucket returns the configured bucket name, for callers that need to
// record where an object lives (e.g. the assets table).
func (c *Client) Bucket() string { return c.bucket }

// EnsureBucket creates the configured bucket if it does not already exist.
// Safe to call on every startup.
func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.mc.BucketExists(ctx, c.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}
	if exists {
		return nil
	}
	if err := c.mc.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{}); err != nil {
		return fmt.Errorf("create bucket: %w", err)
	}
	return nil
}

// PresignedPutURL returns a short-lived URL a client can PUT the object
// directly to, so uploads never pass through the API process.
func (c *Client) PresignedPutURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error) {
	u, err := c.presignMC.PresignedPutObject(ctx, c.bucket, objectKey, ttl)
	if err != nil {
		return nil, fmt.Errorf("presign put %s: %w", objectKey, err)
	}
	return u, nil
}

// PresignedGetURL returns a short-lived URL to read a private object,
// issued only after the caller has checked authorization.
func (c *Client) PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error) {
	u, err := c.presignMC.PresignedGetObject(ctx, c.bucket, objectKey, ttl, nil)
	if err != nil {
		return nil, fmt.Errorf("presign get %s: %w", objectKey, err)
	}
	return u, nil
}

// PresignedGetURLAsAttachment is PresignedGetURL, but forces the
// response's Content-Type and Content-Disposition via S3's
// response-content-* query overrides, ignoring whatever headers the
// object was actually stored with (a direct client PUT controls those,
// not this server). Used for object types a browser would otherwise
// render as a document if the link is opened directly -- SVG chief among
// them, since a <script> inside one then runs in the storage origin's
// security context. Forcing "attachment" only changes that direct-open
// behavior: <img src="..."> and other resource fetches ignore
// Content-Disposition and keep rendering the file as an image.
func (c *Client) PresignedGetURLAsAttachment(ctx context.Context, objectKey string, ttl time.Duration, contentType, filename string) (*url.URL, error) {
	reqParams := url.Values{}
	reqParams.Set("response-content-type", contentType)
	reqParams.Set("response-content-disposition", fmt.Sprintf("attachment; filename=%q", filename))
	u, err := c.presignMC.PresignedGetObject(ctx, c.bucket, objectKey, ttl, reqParams)
	if err != nil {
		return nil, fmt.Errorf("presign get %s: %w", objectKey, err)
	}
	return u, nil
}

// ObjectInfo is the subset of minio.ObjectInfo callers that only need size
// actually use.
type ObjectInfo struct {
	SizeBytes int64
}

// StatObject returns metadata for an already-uploaded object, so a confirm
// step can check its size without downloading it, per docs/08-security.md
// section 6.
func (c *Client) StatObject(ctx context.Context, objectKey string) (ObjectInfo, error) {
	info, err := c.mc.StatObject(ctx, c.bucket, objectKey, minio.StatObjectOptions{})
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("stat %s: %w", objectKey, err)
	}
	return ObjectInfo{SizeBytes: info.Size}, nil
}

// ErrTooLarge is returned by DownloadBounded when the object has more than
// maxBytes: the confirm step treats this the same as an explicit size
// check, without ever pulling an oversized file fully into memory.
var ErrTooLarge = errors.New("storage: object exceeds the requested byte limit")

// DownloadBounded reads at most maxBytes+1 of an object and returns exactly
// what was read, or ErrTooLarge if the object has more than maxBytes. This
// lets a confirm step both sniff the real content type (from the magic
// bytes at the start) and hash the exact bytes it validated, rather than
// trusting a client-supplied Content-Type or size (docs/08-security.md
// section 6). Intended for small uploads (avatars, up to a few MB); it is
// not a general-purpose download method.
func (c *Client) DownloadBounded(ctx context.Context, objectKey string, maxBytes int64) ([]byte, error) {
	obj, err := c.mc.GetObject(ctx, c.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", objectKey, err)
	}
	defer func() { _ = obj.Close() }()

	data, err := io.ReadAll(io.LimitReader(obj, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", objectKey, err)
	}
	if int64(len(data)) > maxBytes {
		return nil, ErrTooLarge
	}
	return data, nil
}

// RemoveObject deletes an object, used to discard an avatar upload that
// fails the confirm step's validation (wrong type, too large).
func (c *Client) RemoveObject(ctx context.Context, objectKey string) error {
	if err := c.mc.RemoveObject(ctx, c.bucket, objectKey, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("remove %s: %w", objectKey, err)
	}
	return nil
}

// GetObject downloads an object's full content server-side. Used by
// modules/permits' evidence-confirmation step, which must decode, re-sniff
// and re-encode an image a client already PUT directly to the presigned
// URL (docs/08-security.md section 6: EXIF stripped, type sniffed from
// content, not the client-declared filename).
func (c *Client) GetObject(ctx context.Context, objectKey string) ([]byte, error) {
	obj, err := c.mc.GetObject(ctx, c.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("get object %s: %w", objectKey, err)
	}
	defer func() { _ = obj.Close() }()

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("read object %s: %w", objectKey, err)
	}
	return data, nil
}

// PutObject uploads content server-side, overwriting objectKey. Used to
// write back a re-encoded evidence image and to store rendered documents
// (letters) the API generates itself rather than a client uploading.
func (c *Client) PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error {
	_, err := c.mc.PutObject(ctx, c.bucket, objectKey, bytes.NewReader(content), int64(len(content)),
		minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return fmt.Errorf("put object %s: %w", objectKey, err)
	}
	return nil
}
