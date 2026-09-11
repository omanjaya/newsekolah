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

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

const defaultAvatarMaxBytes = 2 << 20 // 2 MB, docs/08-security.md section 6

var allowedAvatarTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

// AssetRecord is one assets row.
type AssetRecord struct {
	ID   uuid.UUID
	Mime string
}

// NewAsset is what CreateAssetRecord persists to assets.
type NewAsset struct {
	TenantID   uuid.UUID
	Bucket     string
	ObjectKey  string
	Mime       string
	SizeBytes  int64
	SHA256     string
	Kind       string
	Visibility string
	CreatedBy  uuid.UUID
}

// ProfileRepository is the data-access boundary for the self-service
// profile and avatar endpoints.
type ProfileRepository interface {
	UpdateOwnProfileRecord(ctx context.Context, tenantID, userID uuid.UUID, username, name, email, phone, locale string) error
	GetUserProfile(ctx context.Context, tenantID, userID uuid.UUID) (UserProfileFields, bool, error)
	CreateAssetRecord(ctx context.Context, in NewAsset) (AssetRecord, error)
}

// UpdateMyProfileInput is what a caller can change about their own
// account: the same fields an admin can set via UpdateUser, minus roles
// and status. Username is optional -- blank keeps the current one -- but
// when given, it is normalized and checked for uniqueness exactly like an
// admin-driven update (docs/analysis/backend-inventory.md section 1.5).
type UpdateMyProfileInput struct {
	Username string
	Name     string
	Email    string
	Phone    string
	Locale   string
	// Detail is always applied in full (an upsert into user_profiles plus
	// whichever kind-specific table applies to the caller's existing
	// profile_kind), the same convention UpdateUser's Profile field uses.
	Detail UserProfileFields
}

// UpdateMyProfile updates the caller's own username, name, email, phone,
// locale, and detail record (student/teacher/staff fields).
func (s *Service) UpdateMyProfile(ctx context.Context, tenantID, userID uuid.UUID, in UpdateMyProfileInput) (MeResult, error) {
	var result MeResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		user, err := s.repo.GetUserByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		row, err := s.repo.GetUserAdminByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}

		username := user.Username
		if in.Username != "" {
			normalized := domain.NormalizeUsername(in.Username)
			if normalized != user.Username {
				exists, err := s.repo.UsernameExists(ctx, tenantID, normalized)
				if err != nil {
					return fmt.Errorf("check username exists: %w", err)
				}
				if exists {
					return domain.ErrUserAlreadyExists
				}
			}
			username = normalized
		}

		email := domain.NormalizeEmail(in.Email)
		if email != user.Email {
			if err := s.checkEmailFree(ctx, tenantID, email); err != nil {
				return err
			}
		}

		if err := s.repo.UpdateOwnProfileRecord(ctx, tenantID, userID, username, in.Name, email, in.Phone, in.Locale); err != nil {
			return fmt.Errorf("update own profile: %w", err)
		}
		if row.ProfileKind.Valid() {
			if err := s.writeProfile(ctx, tenantID, userID, row.ProfileKind, in.Detail); err != nil {
				return err
			}
		}

		updated, err := s.repo.GetUserByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		result, err = s.me(ctx, updated)
		if err != nil {
			return err
		}
		return audit.RecordSimple(ctx, tenantID, "user.update_own_profile", "user", userID)
	})
	return result, err
}

// AvatarUploadTarget is what RequestAvatarUpload hands the client: a
// short-lived URL to PUT the image directly to object storage, and the
// object key to send back to ConfirmAvatarUpload.
type AvatarUploadTarget struct {
	UploadURL string
	ObjectKey string
	ExpiresAt time.Time
}

// RequestAvatarUpload issues a presigned PUT URL for a new avatar object.
// The object key is a random UUID under the caller's tenant, never the
// user's ID or name (docs/08-security.md section 6).
func (s *Service) RequestAvatarUpload(ctx context.Context, tenantID uuid.UUID) (AvatarUploadTarget, error) {
	if s.extras.Storage == nil {
		return AvatarUploadTarget{}, domain.ErrUploadNotConfigured
	}

	objectKey := fmt.Sprintf("avatars/%s/%s", tenantID, uuid.New())
	ttl := storage.DefaultUploadURLTTL
	u, err := s.extras.Storage.PresignedPutURL(ctx, objectKey, ttl)
	if err != nil {
		return AvatarUploadTarget{}, fmt.Errorf("presign avatar upload: %w", err)
	}
	return AvatarUploadTarget{UploadURL: u.String(), ObjectKey: objectKey, ExpiresAt: s.clock.Now().Add(ttl)}, nil
}

// ConfirmAvatarUpload validates an already-uploaded object (real content
// type sniffed from its bytes, size within limit), records it as an asset,
// and sets it as userID's avatar. It returns a short-lived signed URL so
// the caller can display the new avatar immediately.
func (s *Service) ConfirmAvatarUpload(ctx context.Context, tenantID, userID uuid.UUID, objectKey string) (string, error) {
	if s.extras.Storage == nil {
		return "", domain.ErrUploadNotConfigured
	}
	if !strings.HasPrefix(objectKey, fmt.Sprintf("avatars/%s/", tenantID)) {
		return "", domain.ErrUploadObjectNotOwned
	}

	maxBytes := s.cfg.AvatarMaxBytes
	if maxBytes <= 0 {
		maxBytes = defaultAvatarMaxBytes
	}

	data, err := s.extras.Storage.DownloadBounded(ctx, objectKey, maxBytes)
	if err != nil {
		if errors.Is(err, storage.ErrTooLarge) {
			return "", domain.ErrUploadFileTooLarge
		}
		return "", fmt.Errorf("download uploaded avatar: %w", err)
	}

	contentType := http.DetectContentType(data)
	if !allowedAvatarTypes[contentType] {
		_ = s.extras.Storage.RemoveObject(ctx, objectKey)
		return "", domain.ErrUploadInvalidFileType
	}
	sum := sha256.Sum256(data)

	var avatarURL string
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.GetUserAdminByID(ctx, tenantID, userID); err != nil {
			return domain.ErrUserNotFound
		}

		asset, err := s.repo.CreateAssetRecord(ctx, NewAsset{
			TenantID: tenantID, Bucket: s.extras.Storage.Bucket(), ObjectKey: objectKey,
			Mime: contentType, SizeBytes: int64(len(data)), SHA256: hex.EncodeToString(sum[:]),
			Kind: "avatar", Visibility: "private", CreatedBy: userID,
		})
		if err != nil {
			return fmt.Errorf("record avatar asset: %w", err)
		}
		if err := s.repo.SetUserAvatarAsset(ctx, tenantID, userID, uuid.NullUUID{UUID: asset.ID, Valid: true}); err != nil {
			return fmt.Errorf("set user avatar: %w", err)
		}

		u, err := s.extras.Storage.PresignedGetURL(ctx, objectKey, storage.DefaultUploadURLTTL)
		if err != nil {
			return fmt.Errorf("presign avatar get: %w", err)
		}
		avatarURL = u.String()
		return audit.RecordSimple(ctx, tenantID, "user.avatar_update", "user", userID)
	})
	return avatarURL, err
}
