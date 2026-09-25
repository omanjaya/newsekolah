package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

// UpdateBranding validates and stores the text half of a tenant's
// branding, then returns the full branding view (including whatever logo
// and favicon are already on file).
func (s *Service) UpdateBranding(ctx context.Context, tenantID, actorID uuid.UUID, in domain.BrandingWrite) (domain.Branding, error) {
	if err := domain.ValidateBrandingWrite(in); err != nil {
		return domain.Branding{}, err
	}

	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		writes := map[string]string{
			"branding.name":       in.Name,
			"branding.short_name": in.ShortName,
			"branding.tagline":    in.Tagline,
		}
		if in.AccentColor != "" {
			writes["branding.accent_color"] = in.AccentColor
		}
		for key, value := range writes {
			if err := s.repo.SetBrandingSetting(ctx, tenantID, actorID, key, value); err != nil {
				return fmt.Errorf("set %s: %w", key, err)
			}
		}
		return nil
	})
	if err != nil {
		return domain.Branding{}, err
	}
	return s.Branding(ctx, tenantID)
}

// AssetUploadTarget is what Request{Logo,Favicon}Upload hands the client:
// a short-lived URL to PUT the image directly to object storage, and the
// object key to send back to the matching Confirm call.
type AssetUploadTarget struct {
	UploadURL string
	ObjectKey string
	ExpiresAt time.Time
}

// RequestLogoUpload issues a presigned PUT URL for a new logo object.
func (s *Service) RequestLogoUpload(ctx context.Context, tenantID uuid.UUID) (AssetUploadTarget, error) {
	return s.requestBrandingUpload(ctx, tenantID, "logo")
}

// RequestFaviconUpload issues a presigned PUT URL for a new favicon object.
func (s *Service) RequestFaviconUpload(ctx context.Context, tenantID uuid.UUID) (AssetUploadTarget, error) {
	return s.requestBrandingUpload(ctx, tenantID, "favicon")
}

func (s *Service) requestBrandingUpload(ctx context.Context, tenantID uuid.UUID, assetType string) (AssetUploadTarget, error) {
	if s.storage == nil {
		return AssetUploadTarget{}, domain.ErrUploadNotConfigured
	}
	objectKey := fmt.Sprintf("branding/%s/%s/%s", tenantID, assetType, uuid.New())
	ttl := storage.DefaultUploadURLTTL
	u, err := s.storage.PresignedPutURL(ctx, objectKey, ttl)
	if err != nil {
		return AssetUploadTarget{}, fmt.Errorf("presign %s upload: %w", assetType, err)
	}
	return AssetUploadTarget{UploadURL: u.String(), ObjectKey: objectKey, ExpiresAt: clock.Real{}.Now().Add(ttl)}, nil
}

// ConfirmLogoUpload validates an already-uploaded logo object (real
// content type sniffed from its bytes, size within
// domain.BrandingLogoMaxBytes) and stores it as the tenant's branding
// logo. It returns the full branding view with the new logo_url.
func (s *Service) ConfirmLogoUpload(ctx context.Context, tenantID, actorID uuid.UUID, objectKey string) (domain.Branding, error) {
	return s.confirmBrandingUpload(ctx, tenantID, actorID, "logo", objectKey, domain.BrandingLogoMaxBytes, "branding.logo_object_key")
}

// ConfirmFaviconUpload is ConfirmLogoUpload's favicon equivalent, with the
// tighter domain.BrandingFaviconMaxBytes limit.
func (s *Service) ConfirmFaviconUpload(ctx context.Context, tenantID, actorID uuid.UUID, objectKey string) (domain.Branding, error) {
	return s.confirmBrandingUpload(ctx, tenantID, actorID, "favicon", objectKey, domain.BrandingFaviconMaxBytes, "branding.favicon_object_key")
}

func (s *Service) confirmBrandingUpload(ctx context.Context, tenantID, actorID uuid.UUID, assetType, objectKey string, maxBytes int64, settingKey string) (domain.Branding, error) {
	if s.storage == nil {
		return domain.Branding{}, domain.ErrUploadNotConfigured
	}
	if !strings.HasPrefix(objectKey, fmt.Sprintf("branding/%s/%s/", tenantID, assetType)) {
		return domain.Branding{}, domain.ErrUploadObjectNotOwned
	}

	data, err := s.storage.DownloadBounded(ctx, objectKey, maxBytes)
	if err != nil {
		if errors.Is(err, storage.ErrTooLarge) {
			return domain.Branding{}, domain.ErrUploadTooLarge
		}
		return domain.Branding{}, fmt.Errorf("download uploaded %s: %w", assetType, err)
	}

	contentType := sniffBrandingImageType(data)
	if !domain.AllowedBrandingImageTypes[contentType] {
		_ = s.storage.RemoveObject(ctx, objectKey)
		return domain.Branding{}, domain.ErrUploadInvalidType
	}
	if contentType == "image/svg+xml" {
		if err := domain.ValidateSVGUpload(data); err != nil {
			_ = s.storage.RemoveObject(ctx, objectKey)
			return domain.Branding{}, err
		}
	}
	sum := sha256.Sum256(data)

	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.CreateAssetRecord(ctx, NewAsset{
			TenantID: tenantID, Bucket: s.storage.Bucket(), ObjectKey: objectKey,
			Mime: contentType, SizeBytes: int64(len(data)), SHA256: hex.EncodeToString(sum[:]),
			Kind: "branding", Visibility: "tenant_public", CreatedBy: actorID,
		}); err != nil {
			return fmt.Errorf("record %s asset: %w", assetType, err)
		}
		if err := s.repo.SetBrandingSetting(ctx, tenantID, actorID, settingKey, objectKey); err != nil {
			return err
		}
		// Recorded alongside the object key so Branding() can force the
		// presigned GET's response-content-type (and, for SVG, force
		// response-content-disposition: attachment) rather than trusting
		// whatever Content-Type the client's direct PUT left on the object.
		return s.repo.SetBrandingSetting(ctx, tenantID, actorID, mimeSettingKey(settingKey), contentType)
	})
	if err != nil {
		return domain.Branding{}, err
	}
	return s.Branding(ctx, tenantID)
}

// mimeSettingKey derives the sibling tenant_settings key that stores an
// asset's sniffed content type, e.g. "branding.logo_object_key" ->
// "branding.logo_mime".
func mimeSettingKey(objectKeySettingKey string) string {
	return strings.TrimSuffix(objectKeySettingKey, "_object_key") + "_mime"
}

// sniffBrandingImageType extends http.DetectContentType with SVG
// recognition: Go's sniffer has no SVG signature (it is XML text, not a
// binary magic number), so an uploaded SVG would otherwise always be
// rejected as "text/xml; charset=utf-8" regardless of its real content.
func sniffBrandingImageType(data []byte) string {
	trimmed := strings.TrimSpace(string(data))
	const sniffWindow = 512
	if len(trimmed) > sniffWindow {
		trimmed = trimmed[:sniffWindow]
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "<?xml") || strings.HasPrefix(lower, "<svg") {
		if strings.Contains(lower, "<svg") {
			return "image/svg+xml"
		}
	}
	return http.DetectContentType(data)
}
