package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) UpdateOwnProfileRecord(ctx context.Context, tenantID, userID uuid.UUID, username, name, email, phone, locale string) error {
	err := r.queries(ctx).UpdateOwnProfile(ctx, db.UpdateOwnProfileParams{
		TenantID: tenantID, ID: userID, Username: username, Name: name, Email: nullableText(email), Phone: nullableText(phone), Locale: locale,
	})
	if err != nil {
		return fmt.Errorf("update own profile: %w", err)
	}
	return nil
}

// GetUserProfile reads the shared user_profiles row (nik, gender,
// birth_date, ...): the columns every profile kind has, as opposed to the
// kind-specific student/teacher/staff_profiles tables GetStudentProfile
// and friends read.
func (r *Repository) GetUserProfile(ctx context.Context, tenantID, userID uuid.UUID) (service.UserProfileFields, bool, error) {
	row, err := r.queries(ctx).GetUserProfile(ctx, db.GetUserProfileParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.UserProfileFields{}, false, nil
		}
		return service.UserProfileFields{}, false, fmt.Errorf("get user profile: %w", err)
	}
	return service.UserProfileFields{
		NIK: pdatabase.TextOrEmpty(row.Nik), Gender: pdatabase.TextOrEmpty(row.Gender),
		BirthPlace: pdatabase.TextOrEmpty(row.BirthPlace), BirthDate: pdatabase.DateOrZero(row.BirthDate),
		Religion: pdatabase.TextOrEmpty(row.Religion), Address: pdatabase.TextOrEmpty(row.Address),
		District: pdatabase.TextOrEmpty(row.District), City: pdatabase.TextOrEmpty(row.City),
		BloodType: pdatabase.TextOrEmpty(row.BloodType),
	}, true, nil
}

func (r *Repository) CreateAssetRecord(ctx context.Context, in service.NewAsset) (service.AssetRecord, error) {
	row, err := r.queries(ctx).CreateAsset(ctx, db.CreateAssetParams{
		TenantID: in.TenantID, Bucket: in.Bucket, ObjectKey: in.ObjectKey, Mime: in.Mime,
		SizeBytes: in.SizeBytes, Sha256: in.SHA256, Kind: in.Kind, Visibility: in.Visibility,
		CreatedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: in.CreatedBy, Valid: true}),
	})
	if err != nil {
		return service.AssetRecord{}, fmt.Errorf("create asset: %w", err)
	}
	return service.AssetRecord{ID: row.ID, Mime: row.Mime}, nil
}
