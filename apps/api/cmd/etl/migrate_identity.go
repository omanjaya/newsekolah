package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

func notFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// isPhoneUniqueViolation reports whether err is a unique-constraint
// violation on users' (tenant_id, phone) constraint -- the live data has
// (at least) two users sharing one recorded phone number, which the
// target schema forbids per tenant.
func isPhoneUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "phone")
}

// ensureAcademicYear reuses a target academic year matching label, or
// creates one when the tenant has none yet. sourceStartsOn/sourceEndsOn --
// the live source's own years.start_date/end_date for the migrated semester
// -- are preferred over mapping.AcademicYearDates' July-to-June guess when
// creating a new year, since they are real dates rather than a derived
// approximation. An existing year's dates are never overwritten, matching
// this function's original select-then-insert caution.
func (st *Store) ensureAcademicYear(ctx context.Context, tenantID uuid.UUID, label string, sourceStartsOn, sourceEndsOn time.Time) (uuid.UUID, bool, error) {
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

	startsOn, endsOn := sourceStartsOn, sourceEndsOn
	if startsOn.IsZero() || endsOn.IsZero() {
		startsOn, endsOn, err = mapping.AcademicYearDates(label)
		if err != nil {
			return uuid.Nil, false, fmt.Errorf("derive dates for academic year %s: %w", label, err)
		}
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
// least-wrong default for an enrollment the source cannot date (the live
// schema's group_members has no joined_at column at all, see
// migrateEnrollments).
func (st *Store) academicYearStartsOn(ctx context.Context, academicYearID uuid.UUID) (pgtype.Date, error) {
	var d pgtype.Date
	err := st.tx.QueryRow(ctx, `select starts_on from academic_years where id = $1`, academicYearID).Scan(&d)
	return d, err
}

// ensureTerm reuses a target term matching (academic year, semester), or
// creates one with the source's own start/end dates. Follows
// ensureAcademicYear's cautious select-then-insert pattern: is_active is
// never touched here (AcademicCreateTerm always inserts it false) -- an
// operational decision for the school admin, not the ETL.
func (st *Store) ensureTerm(ctx context.Context, tenantID, academicYearID uuid.UUID, semester int, startsOn, endsOn time.Time) (uuid.UUID, bool, error) {
	q := db.New(st.tx)
	terms, err := q.AcademicListTermsByYear(ctx, db.AcademicListTermsByYearParams{TenantID: tenantID, AcademicYearID: academicYearID})
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("list terms: %w", err)
	}
	for _, t := range terms {
		if int(t.Sequence) == semester {
			return t.ID, false, nil
		}
	}

	name := "Ganjil"
	if semester == 2 {
		name = "Genap"
	}
	term, err := q.AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
		TenantID: tenantID, AcademicYearID: academicYearID, Name: name, Sequence: int16(semester), //nolint:gosec // semester is 1 or 2
		StartsOn: pgtype.Date{Time: startsOn, Valid: true},
		EndsOn:   pgtype.Date{Time: endsOn, Valid: true},
	})
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("create term %s: %w", name, err)
	}
	return term.ID, true, nil
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
// (enrollments, teaching assignments...) can resolve a source user id to
// the target user id and its resolved identity role.
type userMigrationResult struct {
	targetUserID uuid.UUID
	roleSlug     string
}

// migrateUsers migrates every live-schema user, its identity role, and its
// per-kind profile. Idempotency key: username (mapping.CleanUsername),
// unique per tenant on both sides and, in the live data, always non-empty.
// Password hashes never carry over (the source uses bcrypt, the new schema
// uses argon2id, see docs/13-etl-sion.md): every migrated user gets a random
// placeholder hash and must_change_password = true.
// mappings from the legacy MySQL schema to the new Postgres schema; each
// branch handles one nullable source column or one gap case, and is a
// one-time migration tool exercised by its own tests, not runtime API
// logic. Splitting it would only relocate the same linear mapping.
//
//nolint:gocyclo // ETL migration: a fixed, ordered sequence of per-row/per-column field
func (st *Store) migrateUsers(
	ctx context.Context, tenantID uuid.UUID, roleIDs map[string]uuid.UUID,
	users []SionUser, userRoles map[int64][]string, managementStaff map[int64]string,
	stat *TableStat,
) (map[int64]userMigrationResult, error) {
	q := db.New(st.tx)
	result := make(map[int64]userMigrationResult, len(users))
	unmappedRoleCounts := make(map[string]int)

	stat.RecordGap("user_profiles.gender/religion/district/city/blood_type: no source column in the live schema; always left null")
	stat.RecordGap("student_profiles.father_name/mother_name/guardian_name/guardian_phone/parent_occupation/previous_school/entry_year: no source column; always left null")
	stat.RecordGap("teacher_profiles.nuptk/last_education/joined_year/specialization: no source column; always left null")
	stat.RecordGap("staff_profiles.last_education/joined_year: no source column; always left null (employee_number/position come from user_details.no_id and management_staff where available)")

	for _, u := range users {
		stat.Read++
		username := mapping.CleanUsername(u.Username)
		if username == "" {
			stat.RecordFailure(fmt.Sprintf("%d", u.ID), "empty username after cleanup")
			continue
		}

		roleNames := userRoles[u.ID]
		roleSlug, unmapped, ok := mapping.MapIdentityRole(roleNames)
		for _, un := range unmapped {
			unmappedRoleCounts[un]++
		}
		if !ok {
			// Keyed on the numeric source id, not username: on this school's
			// data a "Customer" account's username is often a phone number,
			// and the report must never carry personal data (see docs/13's
			// data-handling rule) -- every other table's gap/failure key is
			// already the numeric source id for the same reason.
			stat.RecordGap(fmt.Sprintf("user %d: SION role(s) %v have no identity-role equivalent", u.ID, roleNames))
		}

		email := textOrNull(u.Email)
		phone := nullText(u.ContactNumber)
		var managementPosition pgtype.Text
		if position, has := managementStaff[u.ID]; has {
			managementPosition = textOrNull(position)
		}

		// Every write below (user row, role assignment, profile rows) runs
		// inside one savepoint: with 2500+ real, messy source rows a single
		// user can violate a constraint the natural-key lookup does not
		// catch. Without this, that one bad row would abort the
		// transaction and silently fail every user and table processed
		// after it, per store.go's withRowSavepoint doc.
		var targetUser db.User
		created := false
		writeUser := func(phoneArg pgtype.Text) error {
			return st.withRowSavepoint(ctx, func() error {
				placeholderHash, err := auth.HashPassword(uuid.NewString())
				if err != nil {
					return fmt.Errorf("generate placeholder hash: %w", err)
				}

				existing, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{TenantID: tenantID, Username: username})
				switch {
				case notFound(err):
					targetUser, err = q.CreateUser(ctx, db.CreateUserParams{
						TenantID: tenantID, Username: username, Email: email, Phone: phoneArg,
						Name: mapping.CleanName(u.Name), PasswordHash: placeholderHash, Status: mapStatus(u.Status),
						MustChangePassword: true, Locale: "id",
					})
					if err != nil {
						return fmt.Errorf("create user: %w", err)
					}
					created = true
				case err != nil:
					return fmt.Errorf("lookup user: %w", err)
				default:
					targetUser = existing
					if err := q.UpdateUserBasic(ctx, db.UpdateUserBasicParams{
						TenantID: tenantID, ID: targetUser.ID, Name: mapping.CleanName(u.Name),
						Email: email, Phone: phoneArg, Locale: targetUser.Locale,
					}); err != nil {
						return fmt.Errorf("update user: %w", err)
					}
				}

				if roleSlug != "" {
					if roleID, ok := roleIDs[roleSlug]; ok {
						if err := q.AssignUserRole(ctx, db.AssignUserRoleParams{
							UserID: targetUser.ID, RoleID: roleID, TenantID: tenantID, IsPrimary: true,
						}); err != nil {
							return fmt.Errorf("assign role: %w", err)
						}
					}
				}

				if err := st.upsertProfile(ctx, tenantID, targetUser.ID, roleSlug, managementPosition, u); err != nil {
					return fmt.Errorf("upsert profile: %w", err)
				}
				return nil
			})
		}

		err := writeUser(phone)
		phoneDropped := false
		if err != nil && phone.Valid && isPhoneUniqueViolation(err) {
			// Losing the whole account over a phone number shared with
			// another user in this tenant is the wrong trade: migrate the
			// user without it and let the school fix the duplicate later,
			// rather than dropping the person entirely.
			phoneDropped = true
			err = writeUser(pgtype.Text{})
		}
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", u.ID), err.Error())
			continue
		}
		if phoneDropped {
			stat.RecordGap(fmt.Sprintf("user %d: phone number dropped, it duplicates another user's phone in this tenant", u.ID))
		}

		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[u.ID] = userMigrationResult{targetUserID: targetUser.ID, roleSlug: roleSlug}
	}

	roleNames := make([]string, 0, len(unmappedRoleCounts))
	for name := range unmappedRoleCounts {
		roleNames = append(roleNames, name)
	}
	sort.Strings(roleNames)
	for _, name := range roleNames {
		stat.RecordGap(fmt.Sprintf("role %s: %d user(s) have no equivalent duty/role in the new model", name, unmappedRoleCounts[name]))
	}

	return result, nil
}

// textOrNull trims raw and returns it as a valid pgtype.Text, or an
// explicitly invalid one for an empty/all-whitespace value -- e.g. an email
// or phone number pulled straight off a source column, unlike nullText
// (convert.go) which starts from a database/sql.NullString.
func textOrNull(raw string) pgtype.Text {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: trimmed, Valid: true}
}

func mapStatus(status int) string {
	if status == 1 {
		return "active"
	}
	return "inactive"
}

// upsertProfile fills user_profiles and the per-kind profile table
// (student_profiles / teacher_profiles / staff_profiles) for one migrated
// user, following mapping.ProfileKindForRole. managementPosition is handled
// separately from the kind switch below: a management_staff row names a
// staff_profiles.position independent of the person's actual identity role
// (a deputy head is very likely also a Teacher, whose primary profile kind
// is "teacher", not "staff") -- staff_profiles has no constraint tying it to
// user_profiles.kind, so both rows can coexist.
func (st *Store) upsertProfile(ctx context.Context, tenantID, userID uuid.UUID, roleSlug string, managementPosition pgtype.Text, u SionUser) error {
	q := db.New(st.tx)

	kind, ok := mapping.ProfileKindForRole(roleSlug)
	if ok {
		address := u.Address
		if !address.Valid && u.StudentAddress.Valid {
			address = u.StudentAddress
		}

		if err := q.UpsertUserProfile(ctx, db.UpsertUserProfileParams{
			UserID: userID, TenantID: tenantID, Kind: kind,
			Nik:        nullText(u.NoID),
			BirthPlace: nullText(u.StudentBirthPlace),
			BirthDate:  nullDate(u.StudentBirthDate),
			Address:    nullText(address),
		}); err != nil {
			return fmt.Errorf("user_profiles: %w", err)
		}

		switch kind {
		case "student":
			if err := q.UpsertStudentProfile(ctx, db.UpsertStudentProfileParams{
				UserID: userID, TenantID: tenantID, Nis: nullText(u.NIS), Nisn: nullText(u.NISN),
			}); err != nil {
				return fmt.Errorf("student_profiles: %w", err)
			}
		case "teacher":
			if err := q.UpsertTeacherProfile(ctx, db.UpsertTeacherProfileParams{
				UserID: userID, TenantID: tenantID, Nip: nullText(u.NoID),
			}); err != nil {
				return fmt.Errorf("teacher_profiles: %w", err)
			}
		case "staff":
			if err := q.UpsertStaffProfile(ctx, db.UpsertStaffProfileParams{
				UserID: userID, TenantID: tenantID, EmployeeNumber: nullText(u.NoID),
			}); err != nil {
				return fmt.Errorf("staff_profiles: %w", err)
			}
		}
	}

	if managementPosition.Valid {
		if err := q.UpsertStaffProfile(ctx, db.UpsertStaffProfileParams{
			UserID: userID, TenantID: tenantID, EmployeeNumber: nullText(u.NoID), Position: managementPosition,
		}); err != nil {
			return fmt.Errorf("staff_profiles (management position): %w", err)
		}
	}
	return nil
}
