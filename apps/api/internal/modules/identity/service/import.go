package service

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// ImportRowOutcome is what preview and commit report back per row: no
// errors means the row would be (preview) or was (commit) created.
type ImportRowOutcome struct {
	RowNumber int
	Username  string
	Errors    []string
}

// evaluatedRow carries what evaluateImportRows resolved for one row, so
// CommitImport can write it without re-deriving anything.
type evaluatedRow struct {
	ImportRowOutcome
	write   NewUserRecord
	kind    domain.ProfileKind
	profile UserProfileFields
	roleID  uuid.UUID
}

// PreviewImport validates a batch of import rows -- structure, in-file
// duplicates, and duplicates already in the database -- without writing
// anything.
func (s *Service) PreviewImport(ctx context.Context, tenantID, actorID uuid.UUID, rows []domain.ImportRow) ([]ImportRowOutcome, error) {
	if len(rows) == 0 {
		return nil, domain.ErrImportEmpty
	}
	if len(rows) > domain.MaxImportRows {
		return nil, domain.ErrImportTooManyRows
	}
	var outcomes []ImportRowOutcome
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		evaluated, err := s.evaluateImportRows(ctx, tenantID, actorID, rows)
		if err != nil {
			return err
		}
		outcomes = toImportOutcomes(evaluated)
		return nil
	})
	return outcomes, err
}

// CommitImport re-validates the same batch (preview and commit never
// drift) and, only if every row is clean, creates every user in the same
// transaction. A batch with any invalid row commits nothing at all: the
// caller fixes the file and resubmits, rather than reconciling a
// partially-applied import (docs/analysis/backend-inventory.md section
// 1.5).
func (s *Service) CommitImport(ctx context.Context, tenantID, actorID uuid.UUID, rows []domain.ImportRow) ([]ImportRowOutcome, error) {
	if len(rows) == 0 {
		return nil, domain.ErrImportEmpty
	}
	if len(rows) > domain.MaxImportRows {
		return nil, domain.ErrImportTooManyRows
	}

	var outcomes []ImportRowOutcome
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		evaluated, err := s.evaluateImportRows(ctx, tenantID, actorID, rows)
		if err != nil {
			return err
		}
		outcomes = toImportOutcomes(evaluated)

		for _, row := range evaluated {
			if len(row.Errors) > 0 {
				return domain.ErrImportHasRowErrors
			}
		}
		for i := range evaluated {
			if err := s.commitImportRow(ctx, tenantID, actorID, &evaluated[i]); err != nil {
				return fmt.Errorf("row %d: %w", evaluated[i].RowNumber, err)
			}
		}
		return audit.RecordSimple(ctx, tenantID, "user.import_commit", "tenant", tenantID)
	})
	return outcomes, err
}

func toImportOutcomes(rows []evaluatedRow) []ImportRowOutcome {
	out := make([]ImportRowOutcome, len(rows))
	for i, r := range rows {
		out[i] = r.ImportRowOutcome
	}
	return out
}

// evaluateImportRows runs every check that does not write: structural
// validation (domain.ValidateImportRow), role alias resolution and
// lookup, and username/email uniqueness both within the batch and
// against the database. It never creates anything -- PreviewImport calls
// it directly, CommitImport calls it first and only writes if every row
// came back clean.
func (s *Service) evaluateImportRows(ctx context.Context, tenantID, actorID uuid.UUID, rows []domain.ImportRow) ([]evaluatedRow, error) {
	actorIsSuper, err := s.isSuperAdmin(ctx, actorID)
	if err != nil {
		return nil, err
	}

	seenUsernames := map[string]bool{}
	seenEmails := map[string]bool{}

	out := make([]evaluatedRow, len(rows))
	for i, row := range rows {
		out[i] = s.evaluateImportRow(ctx, tenantID, actorIsSuper, row, i+1, seenUsernames, seenEmails)
	}
	return out, nil
}

func (s *Service) evaluateImportRow(
	ctx context.Context, tenantID uuid.UUID, actorIsSuper bool, row domain.ImportRow, defaultRowNumber int,
	seenUsernames, seenEmails map[string]bool,
) evaluatedRow {
	rowNumber := row.RowNumber
	if rowNumber == 0 {
		rowNumber = defaultRowNumber
	}

	username := domain.NormalizeUsername(row.Username)
	email := domain.NormalizeEmail(row.Email)
	roleSlug := domain.ResolveRoleAlias(row.RoleSlug)

	normalized := row
	normalized.RoleSlug = roleSlug
	result := evaluatedRow{ImportRowOutcome: ImportRowOutcome{RowNumber: rowNumber, Username: username}}
	result.Errors = domain.ValidateImportRow(normalized, false)

	if username != "" {
		if seenUsernames[username] {
			result.Errors = append(result.Errors, "duplicate username within this batch")
		}
		seenUsernames[username] = true
		if exists, err := s.repo.UsernameExists(ctx, tenantID, username); err == nil && exists {
			result.Errors = append(result.Errors, "username already in use")
		}
	}
	if email != "" {
		if seenEmails[email] {
			result.Errors = append(result.Errors, "duplicate email within this batch")
		}
		seenEmails[email] = true
		if exists, err := s.repo.EmailExists(ctx, tenantID, email); err == nil && exists {
			result.Errors = append(result.Errors, "email already in use")
		}
	}

	role, err := s.repo.GetRoleBySlug(ctx, tenantID, roleSlug)
	switch {
	case err != nil:
		result.Errors = append(result.Errors, fmt.Sprintf("role %q not found", roleSlug))
	case role.Slug == domain.SuperAdminRoleSlug && !actorIsSuper:
		result.Errors = append(result.Errors, "only a super admin can grant the super admin role")
	case !role.IsSystem:
		// A bulk import always sets exactly one, primary role; the same
		// invariant ValidateRoleGrants enforces for the admin UI's
		// multi-role assignment (domain/user_admin.go) applies here too.
		result.Errors = append(result.Errors, fmt.Sprintf("role %q must be a system role to be an import's primary role", roleSlug))
	default:
		result.roleID = role.ID
	}

	profile, profileErrs := buildImportProfileFields(row)
	result.Errors = append(result.Errors, profileErrs...)
	result.profile = profile
	result.kind = row.ProfileKind

	if len(result.Errors) > 0 {
		return result
	}

	hash, hashErr := s.hashInitialPassword(row.Password)
	if hashErr != nil {
		result.Errors = append(result.Errors, hashErr.Error())
		return result
	}
	locale := "id"
	result.write = NewUserRecord{
		TenantID: tenantID, Username: username, Email: email, PasswordHash: hash,
		Name: row.Name, Locale: locale, MustChangePassword: true,
	}
	return result
}

// buildImportProfileFields converts an ImportRow's string columns to
// UserProfileFields, parsing birth_date and the year columns. Format
// errors are returned as row errors rather than silently dropped.
func buildImportProfileFields(row domain.ImportRow) (UserProfileFields, []string) {
	var errs []string
	f := UserProfileFields{
		NIK: row.NIK, BirthPlace: row.BirthPlace, Religion: row.Religion,
		Address: row.Address, District: row.District, City: row.City,
		NIS: row.NIS, NISN: row.NISN, PreviousSchool: row.PreviousSchool,
		FatherName: row.FatherName, MotherName: row.MotherName,
		GuardianName: row.GuardianName, GuardianPhone: row.GuardianPhone, ParentOccupation: row.ParentOccupation,
		NIP: row.NIP, NUPTK: row.NUPTK, EmploymentStatus: row.EmploymentStatus,
		LastEducation: row.LastEducation, Specialization: row.Specialization,
		EmployeeNumber: row.EmployeeNumber, Position: row.Position,
	}
	if row.Gender != "" {
		if g, ok := domain.NormalizeGender(row.Gender); ok {
			f.Gender = g
		}
	}
	if row.BloodType != "" && domain.ValidateBloodType(row.BloodType) {
		f.BloodType = row.BloodType
	}
	if row.BirthDate != "" {
		if t, err := time.Parse(domain.ImportBirthDateLayout, row.BirthDate); err == nil {
			f.BirthDate = t
		}
	}
	if row.EntryYear != "" {
		if y, err := strconv.Atoi(row.EntryYear); err == nil {
			f.EntryYear = y
		} else {
			errs = append(errs, "entry_year must be a number")
		}
	}
	if row.JoinedYear != "" {
		if y, err := strconv.Atoi(row.JoinedYear); err == nil {
			f.JoinedYear = y
		} else {
			errs = append(errs, "joined_year must be a number")
		}
	}
	return f, errs
}

// commitImportRow creates one already-validated row's user, profile, and
// primary role grant.
func (s *Service) commitImportRow(ctx context.Context, tenantID, actorID uuid.UUID, row *evaluatedRow) error {
	username := row.write.Username
	if username == "" {
		var err error
		username, err = s.resolveNewUsername(ctx, tenantID, "", row.write.Name)
		if err != nil {
			return err
		}
		row.write.Username = username
		row.Username = username
	}

	user, err := s.repo.CreateUserRecord(ctx, row.write)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	if err := s.writeProfile(ctx, tenantID, user.ID, row.kind, row.profile); err != nil {
		return err
	}
	if err := s.repo.AssignUserRoleRecord(ctx, tenantID, user.ID, row.roleID, true); err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	return audit.RecordSimple(ctx, tenantID, "user.import_create", "user", user.ID)
}
