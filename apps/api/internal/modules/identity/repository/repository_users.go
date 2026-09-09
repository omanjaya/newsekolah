package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func cursorParam(id uuid.UUID) pgtype.UUID {
	if id == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}

func nullableText(s string) pgtype.Text { return pdatabase.Text(s) }

func (r *Repository) UsernameExists(ctx context.Context, tenantID uuid.UUID, username string) (bool, error) {
	return r.queries(ctx).UsernameExists(ctx, db.UsernameExistsParams{TenantID: tenantID, Username: username})
}

func (r *Repository) EmailExists(ctx context.Context, tenantID uuid.UUID, email string) (bool, error) {
	return r.queries(ctx).EmailExists(ctx, db.EmailExistsParams{TenantID: tenantID, Email: nullableText(email)})
}

func (r *Repository) ListUsersAdmin(ctx context.Context, tenantID uuid.UUID, f service.ListUsersFilter) ([]service.UserAdminRow, error) {
	rows, err := r.queries(ctx).ListUsersAdmin(ctx, db.ListUsersAdminParams{
		TenantID:        tenantID,
		IncludeArchived: f.IncludeArchived,
		Search:          f.Search,
		Status:          nullableText(f.Status),
		ProfileKind:     nullableText(f.ProfileKind),
		RoleSlug:        nullableText(f.RoleSlug),
		CursorID:        cursorParam(f.Cursor),
		PageLimit:       int32(f.Limit), //nolint:gosec // limit is clamped to <= maxPageLimit (100) by the service
	})
	if err != nil {
		return nil, fmt.Errorf("list users admin: %w", err)
	}
	out := make([]service.UserAdminRow, len(rows))
	for i, row := range rows {
		out[i] = service.UserAdminRow{
			ID: row.ID, Username: row.Username, Email: pdatabase.TextOrEmpty(row.Email), Phone: pdatabase.TextOrEmpty(row.Phone),
			Name: row.Name, Status: domain.UserStatus(row.Status), ProfileKind: domain.ProfileKind(pdatabase.TextOrEmpty(row.ProfileKind)),
			Locale: row.Locale, MustChangePassword: row.MustChangePassword, LastLoginAt: pdatabase.TimeOrZero(row.LastLoginAt),
			CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), AvatarAssetID: pdatabase.UUIDOrNil(row.AvatarAssetID),
		}
	}
	return out, nil
}

func (r *Repository) GetUserAdminByID(ctx context.Context, tenantID, userID uuid.UUID) (service.UserAdminRow, error) {
	row, err := r.queries(ctx).GetUserAdminByID(ctx, db.GetUserAdminByIDParams{TenantID: tenantID, ID: userID})
	if err != nil {
		return service.UserAdminRow{}, fmt.Errorf("get user admin by id: %w", err)
	}
	return service.UserAdminRow{
		ID: row.ID, Username: row.Username, Email: pdatabase.TextOrEmpty(row.Email), Phone: pdatabase.TextOrEmpty(row.Phone),
		Name: row.Name, Status: domain.UserStatus(row.Status), ProfileKind: domain.ProfileKind(pdatabase.TextOrEmpty(row.ProfileKind)),
		Locale: row.Locale, MustChangePassword: row.MustChangePassword, LastLoginAt: pdatabase.TimeOrZero(row.LastLoginAt),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), AvatarAssetID: pdatabase.UUIDOrNil(row.AvatarAssetID),
	}, nil
}

func (r *Repository) GetStudentProfile(ctx context.Context, tenantID, userID uuid.UUID) (service.UserProfileFields, bool, error) {
	row, err := r.queries(ctx).GetStudentProfile(ctx, db.GetStudentProfileParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.UserProfileFields{}, false, nil
		}
		return service.UserProfileFields{}, false, fmt.Errorf("get student profile: %w", err)
	}
	return service.UserProfileFields{
		NIS: pdatabase.TextOrEmpty(row.Nis), NISN: pdatabase.TextOrEmpty(row.Nisn),
		EntryYear: pdatabase.Int2OrZero(row.EntryYear), PreviousSchool: pdatabase.TextOrEmpty(row.PreviousSchool),
		FatherName: pdatabase.TextOrEmpty(row.FatherName), MotherName: pdatabase.TextOrEmpty(row.MotherName),
		GuardianName: pdatabase.TextOrEmpty(row.GuardianName), GuardianPhone: pdatabase.TextOrEmpty(row.GuardianPhone),
		ParentOccupation: pdatabase.TextOrEmpty(row.ParentOccupation),
	}, true, nil
}

func (r *Repository) GetTeacherProfile(ctx context.Context, tenantID, userID uuid.UUID) (service.UserProfileFields, bool, error) {
	row, err := r.queries(ctx).GetTeacherProfile(ctx, db.GetTeacherProfileParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.UserProfileFields{}, false, nil
		}
		return service.UserProfileFields{}, false, fmt.Errorf("get teacher profile: %w", err)
	}
	return service.UserProfileFields{
		NIP: pdatabase.TextOrEmpty(row.Nip), NUPTK: pdatabase.TextOrEmpty(row.Nuptk),
		EmploymentStatus: pdatabase.TextOrEmpty(row.EmploymentStatus), LastEducation: pdatabase.TextOrEmpty(row.LastEducation),
		JoinedYear: pdatabase.Int2OrZero(row.JoinedYear), Specialization: pdatabase.TextOrEmpty(row.Specialization),
	}, true, nil
}

func (r *Repository) GetStaffProfile(ctx context.Context, tenantID, userID uuid.UUID) (service.UserProfileFields, bool, error) {
	row, err := r.queries(ctx).GetStaffProfile(ctx, db.GetStaffProfileParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return service.UserProfileFields{}, false, nil
		}
		return service.UserProfileFields{}, false, fmt.Errorf("get staff profile: %w", err)
	}
	return service.UserProfileFields{
		EmployeeNumber: pdatabase.TextOrEmpty(row.EmployeeNumber), Position: pdatabase.TextOrEmpty(row.Position),
		EmploymentStatus: pdatabase.TextOrEmpty(row.EmploymentStatus), LastEducation: pdatabase.TextOrEmpty(row.LastEducation),
		JoinedYear: pdatabase.Int2OrZero(row.JoinedYear),
	}, true, nil
}

func (r *Repository) CreateUserRecord(ctx context.Context, in service.NewUserRecord) (domain.User, error) {
	row, err := r.queries(ctx).CreateUser(ctx, db.CreateUserParams{
		TenantID: in.TenantID, Username: in.Username, Email: nullableText(in.Email), Phone: nullableText(in.Phone),
		PasswordHash: in.PasswordHash, Name: in.Name, Status: string(domain.UserActive),
		MustChangePassword: in.MustChangePassword, Locale: in.Locale,
	})
	if err != nil {
		return domain.User{}, fmt.Errorf("create user: %w", err)
	}
	return toDomainUser(row), nil
}

func (r *Repository) UpsertUserProfile(ctx context.Context, tenantID, userID uuid.UUID, kind domain.ProfileKind, f service.UserProfileFields) error {
	err := r.queries(ctx).UpsertUserProfile(ctx, db.UpsertUserProfileParams{
		UserID: userID, TenantID: tenantID, Kind: string(kind),
		Nik: nullableText(f.NIK), Gender: nullableText(f.Gender), BirthPlace: nullableText(f.BirthPlace),
		BirthDate: pdatabase.Date(f.BirthDate), Religion: nullableText(f.Religion), Address: nullableText(f.Address),
		District: nullableText(f.District), City: nullableText(f.City), BloodType: nullableText(f.BloodType),
	})
	if err != nil {
		return fmt.Errorf("upsert user profile: %w", err)
	}
	return nil
}

func (r *Repository) UpsertStudentProfile(ctx context.Context, tenantID, userID uuid.UUID, f service.UserProfileFields) error {
	err := r.queries(ctx).UpsertStudentProfile(ctx, db.UpsertStudentProfileParams{
		UserID: userID, TenantID: tenantID, Nis: nullableText(f.NIS), Nisn: nullableText(f.NISN),
		EntryYear: pdatabase.Int2(f.EntryYear), PreviousSchool: nullableText(f.PreviousSchool),
		FatherName: nullableText(f.FatherName), MotherName: nullableText(f.MotherName),
		GuardianName: nullableText(f.GuardianName), GuardianPhone: nullableText(f.GuardianPhone),
		ParentOccupation: nullableText(f.ParentOccupation),
	})
	if err != nil {
		return fmt.Errorf("upsert student profile: %w", err)
	}
	return nil
}

func (r *Repository) UpsertTeacherProfile(ctx context.Context, tenantID, userID uuid.UUID, f service.UserProfileFields) error {
	err := r.queries(ctx).UpsertTeacherProfile(ctx, db.UpsertTeacherProfileParams{
		UserID: userID, TenantID: tenantID, Nip: nullableText(f.NIP), Nuptk: nullableText(f.NUPTK),
		EmploymentStatus: nullableText(f.EmploymentStatus), LastEducation: nullableText(f.LastEducation),
		JoinedYear: pdatabase.Int2(f.JoinedYear), Specialization: nullableText(f.Specialization),
	})
	if err != nil {
		return fmt.Errorf("upsert teacher profile: %w", err)
	}
	return nil
}

func (r *Repository) UpsertStaffProfile(ctx context.Context, tenantID, userID uuid.UUID, f service.UserProfileFields) error {
	err := r.queries(ctx).UpsertStaffProfile(ctx, db.UpsertStaffProfileParams{
		UserID: userID, TenantID: tenantID, EmployeeNumber: nullableText(f.EmployeeNumber), Position: nullableText(f.Position),
		EmploymentStatus: nullableText(f.EmploymentStatus), LastEducation: nullableText(f.LastEducation),
		JoinedYear: pdatabase.Int2(f.JoinedYear),
	})
	if err != nil {
		return fmt.Errorf("upsert staff profile: %w", err)
	}
	return nil
}

func (r *Repository) UpdateUserBasic(ctx context.Context, tenantID, userID uuid.UUID, name, email, phone, locale string) error {
	err := r.queries(ctx).UpdateUserBasic(ctx, db.UpdateUserBasicParams{
		TenantID: tenantID, ID: userID, Name: name, Email: nullableText(email), Phone: nullableText(phone), Locale: locale,
	})
	if err != nil {
		return fmt.Errorf("update user basic: %w", err)
	}
	return nil
}

func (r *Repository) ArchiveUserRecord(ctx context.Context, tenantID, userID uuid.UUID) error {
	return r.queries(ctx).ArchiveUser(ctx, db.ArchiveUserParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) RestoreUserRecord(ctx context.Context, tenantID, userID uuid.UUID) error {
	return r.queries(ctx).RestoreUser(ctx, db.RestoreUserParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) DeleteUserRoles(ctx context.Context, tenantID, userID uuid.UUID) error {
	return r.queries(ctx).DeleteUserRoles(ctx, db.DeleteUserRolesParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) AssignUserRoleRecord(ctx context.Context, tenantID, userID, roleID uuid.UUID, isPrimary bool) error {
	return r.queries(ctx).AssignUserRole(ctx, db.AssignUserRoleParams{
		UserID: userID, RoleID: roleID, TenantID: tenantID, IsPrimary: isPrimary,
	})
}

func (r *Repository) ListUserRoleSlugs(ctx context.Context, userID uuid.UUID) ([]string, error) {
	return r.queries(ctx).ListUserRoleSlugs(ctx, userID)
}

func (r *Repository) SetUserAvatarAsset(ctx context.Context, tenantID, userID uuid.UUID, assetID uuid.NullUUID) error {
	return r.queries(ctx).SetUserAvatarAsset(ctx, db.SetUserAvatarAssetParams{
		TenantID: tenantID, ID: userID, AvatarAssetID: pdatabase.NullUUID(assetID),
	})
}

func (r *Repository) CreatePasswordResetRecord(ctx context.Context, in service.NewPasswordReset) error {
	_, err := r.queries(ctx).CreatePasswordReset(ctx, db.CreatePasswordResetParams{
		TenantID: in.TenantID, UserID: in.UserID, TokenHash: in.TokenHash, Channel: in.Channel,
		ExpiresAt: pdatabase.Timestamptz(in.ExpiresAt),
	})
	if err != nil {
		return fmt.Errorf("create password reset: %w", err)
	}
	return nil
}
