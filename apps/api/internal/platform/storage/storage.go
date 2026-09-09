// Package storage wraps an S3-compatible object store (MinIO self-hosted,
// or S3/R2 for SaaS). All access to an uploaded file goes through a
// short-lived signed URL issued after an authorization check
// (docs/08-security.md section 6); nothing is ever served from a public
// directory. No module uses this yet in this phase (no upload endpoint
// exists), but the client is real and connects to the dev MinIO started by
// `make infra-up`.
package storage

import (
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
)

type Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	// UseSSL should be true for any endpoint that is not the local dev
	// MinIO container.
	UseSSL bool
}

type Client struct {
	mc     *minio.Client
	bucket string
}

func NewClient(cfg Config) (*Client, error) {
	mc, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}
	return &Client{mc: mc, bucket: cfg.Bucket}, nil
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
	u, err := c.mc.PresignedPutObject(ctx, c.bucket, objectKey, ttl)
	if err != nil {
		return nil, fmt.Errorf("presign put %s: %w", objectKey, err)
	}
	return u, nil
}

// PresignedGetURL returns a short-lived URL to read a private object,
// issued only after the caller has checked authorization.
func (c *Client) PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error) {
	u, err := c.mc.PresignedGetObject(ctx, c.bucket, objectKey, ttl, nil)
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
