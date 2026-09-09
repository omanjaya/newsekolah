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
