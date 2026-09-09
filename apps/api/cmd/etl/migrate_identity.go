package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

func notFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// ensureAcademicYear reuses a target academic year matching label, or
// creates one with dates derived from the label (see
// mapping.AcademicYearDates) when the tenant has none yet.
func (st *Store) ensureAcademicYear(ctx context.Context, tenantID uuid.UUID, label string) (uuid.UUID, bool, error) {
	q := db.New(st.tx)
	if year, err := q.GetActiveAcademicYear(ctx, tenantID); err == nil && year.Label == label {
		return year.ID, false, nil
	} else if err != nil && !notFound(err) {
		return uuid.Nil, false, fmt.Errorf("lookup active academic year: %w", err)
	}

	id, found, err := st.selectID(ctx, `select id from academic_years where tenant_id = $1 and label = $2`, tenantID, label)
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("lookup academic year %s: %w", label, err)
	}
	if found {
		return id, false, nil
	}

	startsOn, endsOn, err := mapping.AcademicYearDates(label)
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("derive dates for academic year %s: %w", label, err)
	}
	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantID, Label: label,
		StartsOn: pgtype.Date{Time: startsOn, Valid: true},
		EndsOn:   pgtype.Date{Time: endsOn, Valid: true},
		IsActive: false,
	})
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("create academic year %s: %w", label, err)
	}
	return year.ID, true, nil
}

// academicYearStartsOn reads back an academic year's starts_on, used as the
// least-wrong default for an enrollment whose joined_on SION never recorded.
func (st *Store) academicYearStartsOn(ctx context.Context, academicYearID uuid.UUID) (pgtype.Date, error) {
	var d pgtype.Date
	err := st.tx.QueryRow(ctx, `select starts_on from academic_years where id = $1`, academicYearID).Scan(&d)
	return d, err
}

// ensureRolesAndDuties makes sure every role and duty type the mapping
// package can produce exists for the tenant, exactly like cmd/seed does:
// permission grants come from authz.RoleDefaults so the ETL never disagrees
// with what a freshly onboarded tenant would already have.
func (st *Store) ensureRolesAndDuties(ctx context.Context, tenantID uuid.UUID) (roleIDs, dutyIDs map[string]uuid.UUID, err error) {
	q := db.New(st.tx)
	roleIDs = make(map[string]uuid.UUID)
	for _, rs := range authz.RoleDefaults() {
		role, err := q.GetRoleBySlug(ctx, db.GetRoleBySlugParams{TenantID: tenantID, Slug: rs.Slug})
		if notFound(err) {
			role, err = q.CreateRole(ctx, db.CreateRoleParams{TenantID: tenantID, Slug: rs.Slug, Name: rs.Name, IsSystem: true})
		}
		if err != nil {
			return nil, nil, fmt.Errorf("ensure role %s: %w", rs.Slug, err)
		}
		for _, code := range rs.Permissions {
			if err := q.AddRolePermission(ctx, db.AddRolePermissionParams{RoleID: role.ID, PermissionCode: code, TenantID: tenantID}); err != nil {
				return nil, nil, fmt.Errorf("grant %s to %s: %w", code, rs.Slug, err)
			}
		}
		roleIDs[rs.Slug] = role.ID
	}

	dutyIDs = make(map[string]uuid.UUID)
	for _, ds := range systemDuties {
		dutyType, err := q.GetDutyTypeBySlug(ctx, db.GetDutyTypeBySlugParams{TenantID: tenantID, Slug: ds.slug})
		if notFound(err) {
			dutyType, err = q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: tenantID, Slug: ds.slug, Name: ds.name, ScopeKind: ds.scopeKind})
		}
		if err != nil {
			return nil, nil, fmt.Errorf("ensure duty type %s: %w", ds.slug, err)
		}
		dutyIDs[ds.slug] = dutyType.ID
	}
	return roleIDs, dutyIDs, nil
}

// systemDuties mirrors apps/api/cmd/seed/main.go's systemDuties list, minus
// permission grants (onboarding already grants them; the ETL only needs the
// row to exist so duty_assignments can reference it).
var systemDuties = []struct{ slug, name, scopeKind string }{
	{mapping.DutyHomeroom, "Wali Kelas", "class"},
	{mapping.DutyCounselor, "Guru BK", "school"},
	{mapping.DutyPicket, "Guru Piket", "school"},
	{mapping.DutyLeadership, "Wakil Kepala Sekolah", "school"},
	{mapping.DutySecurity, "Satpam", "school"},
	{mapping.DutyLibrarian, "Petugas Perpustakaan", "school"},
}

// userMigrationResult is what migrateUsers reports back so later steps
// (enrollments, teaching assignments...) can resolve a SION user id to the
// target user id and its role.
type userMigrationResult struct {
	targetUserID uuid.UUID
	roleSlug     string
}

// migrateUsers migrates every SION user, its role, and its per-kind profile.
// Idempotency key: username (mapping.CleanUsername), unique per tenant on
// both sides. Password hashes never carry over (SION uses bcrypt, the new
// schema uses argon2id, see docs/13-etl-sion.md): every migrated user gets a
// random placeholder hash and must_change_password = true.
func (st *Store) migrateUsers(ctx context.Context, tenantID uuid.UUID, roleIDs map[string]uuid.UUID, users []SionUser, stat *TableStat) (map[string]userMigrationResult, error) {
	q := db.New(st.tx)
	result := make(map[string]userMigrationResult, len(users))

	for _, u := range users {
		stat.Read++
		username := mapping.CleanUsername(u.Username)
		if username == "" {
			stat.RecordFailure(u.ID, "empty username after cleanup")
			continue
		}

		roleSlug := ""
		if u.RoleID.Valid {
			slug, ok := mapping.MapRole(u.RoleID.String)
			if !ok {
				stat.RecordGap(fmt.Sprintf("user %s: SION role %q has no equivalent in the new role model", username, u.RoleID.String))
			} else {
				roleSlug = slug
			}
		} else {
			stat.RecordGap(fmt.Sprintf("user %s: no role assigned in SION", username))
		}

		placeholderHash, err := auth.HashPassword(uuid.NewString())
		if err != nil {
			return nil, fmt.Errorf("generate placeholder hash for %s: %w", username, err)
		}

		existing, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{TenantID: tenantID, Username: username})
		var targetUser db.User
		created := false
		switch {
		case notFound(err):
			targetUser, err = q.CreateUser(ctx, db.CreateUserParams{
				TenantID: tenantID, Username: username, Name: mapping.CleanName(u.Name),
				PasswordHash: placeholderHash, Status: mapStatus(u.Status),
				MustChangePassword: true, Locale: "id",
			})
			if err != nil {
				stat.RecordFailure(username, fmt.Sprintf("create user: %v", err))
				continue
			}
			created = true
		case err != nil:
			stat.RecordFailure(username, fmt.Sprintf("lookup user: %v", err))
			continue
		default:
			targetUser = existing
			if err := q.UpdateUserBasic(ctx, db.UpdateUserBasicParams{
				TenantID: tenantID, ID: targetUser.ID, Name: mapping.CleanName(u.Name),
				Email: targetUser.Email, Phone: targetUser.Phone, Locale: targetUser.Locale,
			}); err != nil {
				stat.RecordFailure(username, fmt.Sprintf("update user: %v", err))
				continue
			}
		}

		if created {
			stat.Created++
		} else {
			stat.Updated++
		}

		if roleSlug != "" {
			if roleID, ok := roleIDs[roleSlug]; ok {
				if err := q.AssignUserRole(ctx, db.AssignUserRoleParams{
					UserID: targetUser.ID, RoleID: roleID, TenantID: tenantID, IsPrimary: true,
				}); err != nil {
					stat.RecordFailure(username, fmt.Sprintf("assign role: %v", err))
				}
			}
		}

		if err := st.upsertProfile(ctx, tenantID, targetUser.ID, roleSlug, u); err != nil {
			stat.RecordFailure(username, fmt.Sprintf("upsert profile: %v", err))
		}

		result[u.ID] = userMigrationResult{targetUserID: targetUser.ID, roleSlug: roleSlug}
	}
	return result, nil
}

func mapStatus(sionStatus string) string {
	if sionStatus == "inactive" {
		return "inactive"
	}
	return "active"
}

// upsertProfile fills user_profiles and the per-kind profile table
// (student_profiles / teacher_profiles / staff_profiles) for one migrated
// user, following mapping.ProfileKindForRole.
func (st *Store) upsertProfile(ctx context.Context, tenantID, userID uuid.UUID, roleSlug string, u SionUser) error {
	q := db.New(st.tx)
	kind, ok := mapping.ProfileKindForRole(roleSlug)
	if !ok {
		return nil // no role, or a role with no profile kind (e.g. none mapped) -- nothing to fill
	}

	var gender pgtype.Text
	if u.Gender.Valid {
		if g, ok := mapping.MapGender(u.Gender.String); ok {
			gender = pgtype.Text{String: g, Valid: true}
		}
	}

	if err := q.UpsertUserProfile(ctx, db.UpsertUserProfileParams{
		UserID: userID, TenantID: tenantID, Kind: kind,
		Nik:        nullText(u.NIK),
		Gender:     gender,
		BirthPlace: nullText(u.BirthPlace),
		BirthDate:  nullDate(u.BirthDate),
		Religion:   nullText(u.Religion),
		Address:    nullText(u.Address),
		District:   nullText(u.District),
		City:       nullText(u.City),
	}); err != nil {
		return fmt.Errorf("user_profiles: %w", err)
	}

	switch kind {
	case "student":
		return q.UpsertStudentProfile(ctx, db.UpsertStudentProfileParams{
			UserID: userID, TenantID: tenantID,
			Nis: nullText(u.NIS), Nisn: nullText(u.NISN),
			EntryYear: nullYear(u.EntryYear), PreviousSchool: nullText(u.PreviousSchool),
			FatherName: nullText(u.FatherName), MotherName: nullText(u.MotherName),
			GuardianName: nullText(u.GuardianName), GuardianPhone: nullText(u.GuardianPhone),
			ParentOccupation: nullText(u.ParentOccupation),
		})
	case "teacher":
		employment, _ := optionalEmploymentStatus(u.TeacherEmploymentStatus)
		return q.UpsertTeacherProfile(ctx, db.UpsertTeacherProfileParams{
			UserID: userID, TenantID: tenantID,
			Nip: nullText(u.NIP), Nuptk: nullText(u.NUPTK),
			EmploymentStatus: employment, LastEducation: nullText(u.TeacherLastEducation),
			JoinedYear: nullYear(u.TeacherJoinedYear), Specialization: nullText(u.TeachingSpecialization),
		})
	case "staff":
		employment, _ := optionalEmploymentStatus(u.EmployeeEmploymentStatus)
		return q.UpsertStaffProfile(ctx, db.UpsertStaffProfileParams{
			UserID: userID, TenantID: tenantID,
			EmployeeNumber: nullText(u.EmployeeNumber), Position: nullText(u.EmployeePosition),
			EmploymentStatus: employment, LastEducation: nullText(u.EmployeeLastEducation),
			JoinedYear: nullYear(u.EmployeeJoinedYear),
		})
	default:
		return nil
	}
}

func optionalEmploymentStatus(raw sql.NullString) (pgtype.Text, bool) {
	if !raw.Valid {
		return pgtype.Text{}, false
	}
	v, ok := mapping.MapEmploymentStatus(raw.String)
	if !ok {
		return pgtype.Text{}, false
	}
	return pgtype.Text{String: v, Valid: true}, true
}
