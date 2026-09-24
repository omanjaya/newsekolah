package service

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// ImportOptions is the batch-level choice PreviewImport and CommitImport
// must agree on: preview and commit never drift, so both take the same
// options for the same file (transport/http/import.go passes what the
// request body carries).
type ImportOptions struct {
	// Mode defaults to domain.ImportModeCreate when empty.
	Mode domain.ImportMode
	// UpdateRoles only matters in upsert mode: it asks a matched row's
	// role_slug to replace the existing user's role. The caller must hold
	// manage_permissions or the whole request is rejected up front
	// (evaluateImportRows), never silently ignored per row.
	UpdateRoles bool
}

func (o ImportOptions) mode() domain.ImportMode {
	if o.Mode == "" {
		return domain.ImportModeCreate
	}
	return o.Mode
}

// ImportRowOutcome is what preview and commit report back per row: Action
// is what the row will do (preview) or did (commit); Changes names the
// fields an update row's values differ on; Errors is non-empty exactly
// when Action is domain.ImportActionError.
type ImportRowOutcome struct {
	RowNumber int
	Username  string
	Action    domain.ImportAction
	Changes   []string
	Errors    []string
}

// evaluatedRow carries what evaluateImportRows resolved for one row, so
// CommitImport can write it without re-deriving anything. write is filled
// for a create row; userID/name/email/phone/locale for an update row.
type evaluatedRow struct {
	ImportRowOutcome

	write NewUserRecord

	kind    domain.ProfileKind
	profile UserProfileFields
	roleID  uuid.UUID

	userID    uuid.UUID
	name      string
	email     string
	phone     string
	locale    string
	applyRole bool
}

// existingUserMatch is what matchExistingUser found for one row's
// username, alongside enough of that user's current state to diff against
// and to write back unchanged fields.
type existingUserMatch struct {
	row     UserAdminRow
	profile UserProfileFields
	roles   []domain.Role
}

// importSummary is the audit trail's before/after payload for one import
// commit: counts, not a full row dump (docs/08-security.md keeps audit
// entries small and free of profile PII where a summary will do).
type importSummary struct {
	Mode      string `json:"mode"`
	Rows      int    `json:"rows"`
	Created   int    `json:"created"`
	Updated   int    `json:"updated"`
	Unchanged int    `json:"unchanged"`
}

// PreviewImport validates a batch of import rows -- structure, in-file
// duplicates, duplicates already in the database, and (in upsert mode)
// which rows match an existing user -- without writing anything.
func (s *Service) PreviewImport(ctx context.Context, tenantID, actorID uuid.UUID, rows []domain.ImportRow, opts ImportOptions) ([]ImportRowOutcome, error) {
	if len(rows) == 0 {
		return nil, domain.ErrImportEmpty
	}
	if len(rows) > domain.MaxImportRows {
		return nil, domain.ErrImportTooManyRows
	}
	var outcomes []ImportRowOutcome
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		evaluated, err := s.evaluateImportRows(ctx, tenantID, actorID, rows, opts)
		if err != nil {
			return err
		}
		outcomes = toImportOutcomes(evaluated)
		return nil
	})
	return outcomes, err
}

// CommitImport re-validates the same batch (preview and commit never
// drift) and, only if every row is clean, writes every row in the same
// transaction: a create row creates a user, an update row writes only the
// fields that differ from what the matched user already has, and an
// unchanged row writes nothing at all. A batch with any invalid row
// commits nothing (docs/analysis/backend-inventory.md section 1.5): the
// caller fixes the file and resubmits, rather than reconciling a
// partially-applied import.
func (s *Service) CommitImport(ctx context.Context, tenantID, actorID uuid.UUID, rows []domain.ImportRow, opts ImportOptions) ([]ImportRowOutcome, error) {
	if len(rows) == 0 {
		return nil, domain.ErrImportEmpty
	}
	if len(rows) > domain.MaxImportRows {
		return nil, domain.ErrImportTooManyRows
	}

	var outcomes []ImportRowOutcome
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		evaluated, err := s.evaluateImportRows(ctx, tenantID, actorID, rows, opts)
		if err != nil {
			return err
		}
		outcomes = toImportOutcomes(evaluated)

		for _, row := range evaluated {
			if len(row.Errors) > 0 {
				return domain.ErrImportHasRowErrors
			}
		}

		summary := importSummary{Mode: string(opts.mode()), Rows: len(evaluated)}
		for i := range evaluated {
			if err := s.commitImportRow(ctx, tenantID, actorID, &evaluated[i]); err != nil {
				return fmt.Errorf("row %d: %w", evaluated[i].RowNumber, err)
			}
			switch evaluated[i].Action {
			case domain.ImportActionCreate:
				summary.Created++
			case domain.ImportActionUpdate:
				summary.Updated++
			case domain.ImportActionUnchanged:
				summary.Unchanged++
			}
		}
		// Refreshed after the write loop: a create row with no explicit
		// username gets one assigned inside commitImportRow
		// (resolveNewUsername), which the snapshot taken before the loop
		// would otherwise report blank.
		outcomes = toImportOutcomes(evaluated)
		return audit.Record(ctx, tenantID, "user.import_commit", "tenant", tenantID, nil, summary)
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
// lookup, username/email uniqueness both within the batch and against the
// database, and -- in upsert mode -- matching each row to an existing
// user by username and diffing its fields. It never writes anything;
// PreviewImport calls it directly, CommitImport calls it first and only
// writes if every row came back clean.
func (s *Service) evaluateImportRows(ctx context.Context, tenantID, actorID uuid.UUID, rows []domain.ImportRow, opts ImportOptions) ([]evaluatedRow, error) {
	opts.Mode = opts.mode()

	actorIsSuper, err := s.isSuperAdmin(ctx, actorID)
	if err != nil {
		return nil, err
	}

	if opts.Mode == domain.ImportModeUpsert && opts.UpdateRoles {
		// A role-only check, not the full loadPrincipal (which also folds
		// in active-duty permissions scoped to the current academic year):
		// manage_permissions is always role-granted, never duty-granted,
		// and this runs for every import regardless of whether the school
		// module wired an AcademicYearReader into this Service at all.
		allowed, err := s.actorHasPermission(ctx, tenantID, actorID, authz.PermManagePermissions)
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, domain.ErrImportRoleUpdateForbidden
		}
	}

	seenUsernames := map[string]bool{}
	seenEmails := map[string]bool{}

	out := make([]evaluatedRow, len(rows))
	for i, row := range rows {
		out[i] = s.evaluateImportRow(ctx, tenantID, actorIsSuper, opts, row, i+1, seenUsernames, seenEmails)
	}
	return out, nil
}

// actorHasPermission reports whether actorID currently holds code through
// one of their roles in tenantID. Deliberately role-only (see its one call
// site in evaluateImportRows): unlike loadPrincipal, it never touches
// AcademicYearReader, so it works even when a Service is constructed
// without one wired in (every non-school-aware test, and any deployment
// mode where identity runs standalone).
func (s *Service) actorHasPermission(ctx context.Context, tenantID, actorID uuid.UUID, code string) (bool, error) {
	roles, err := s.repo.ListRolesForUser(ctx, tenantID, actorID)
	if err != nil {
		return false, fmt.Errorf("list roles for %s: %w", actorID, err)
	}
	roleIDs := make([]uuid.UUID, len(roles))
	for i, r := range roles {
		roleIDs[i] = r.ID
	}
	perms, err := s.repo.ListPermissionCodesForRoles(ctx, roleIDs)
	if err != nil {
		return false, fmt.Errorf("list permission codes for %s: %w", actorID, err)
	}
	for _, p := range perms {
		if p == code {
			return true, nil
		}
	}
	return false, nil
}

// matchExistingUser looks up username in tenantID when mode is upsert,
// returning the matched user's admin row, merged profile fields, and role
// grants. Any lookup failure (not found, or a transient error) is treated
// as no match -- the row falls back to create, the same leniency
// UsernameExists/EmailExists already apply elsewhere in this file.
func (s *Service) matchExistingUser(ctx context.Context, tenantID uuid.UUID, mode domain.ImportMode, username string) (existingUserMatch, bool) {
	if mode != domain.ImportModeUpsert || username == "" {
		return existingUserMatch{}, false
	}
	user, err := s.repo.GetUserByUsername(ctx, tenantID, username)
	if err != nil {
		return existingUserMatch{}, false
	}
	row, err := s.repo.GetUserAdminByID(ctx, tenantID, user.ID)
	if err != nil {
		return existingUserMatch{}, false
	}
	profile, _, _ := s.loadProfileFields(ctx, tenantID, user.ID, row.ProfileKind)
	roles, _ := s.repo.ListRolesForUser(ctx, tenantID, user.ID)
	return existingUserMatch{row: row, profile: profile, roles: roles}, true
}

func (s *Service) evaluateImportRow(
	ctx context.Context, tenantID uuid.UUID, actorIsSuper bool, opts ImportOptions, row domain.ImportRow, defaultRowNumber int,
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

	existing, isUpdate := s.matchExistingUser(ctx, tenantID, opts.Mode, username)

	result := evaluatedRow{ImportRowOutcome: ImportRowOutcome{RowNumber: rowNumber, Username: username}}
	result.Errors = domain.ValidateImportRow(normalized, isUpdate)

	if username != "" {
		if seenUsernames[username] {
			result.Errors = append(result.Errors, "duplicate username within this batch")
		}
		seenUsernames[username] = true
		// A match is exactly what makes this an update, not a conflict; the
		// database-uniqueness check below only applies to a row that is
		// still going to create a new user.
		if !isUpdate {
			if exists, err := s.repo.UsernameExists(ctx, tenantID, username); err == nil && exists {
				result.Errors = append(result.Errors, "username already in use")
			}
		}
	}

	// A blank email on an update row means "leave it as is", so the
	// effective value to check for conflicts is whatever the row supplies,
	// falling back to what the matched user already has.
	effectiveEmail := email
	emailChanged := true
	if isUpdate {
		if email == "" {
			effectiveEmail = existing.row.Email
		}
		emailChanged = effectiveEmail != existing.row.Email
	}
	if effectiveEmail != "" {
		if seenEmails[effectiveEmail] {
			result.Errors = append(result.Errors, "duplicate email within this batch")
		}
		seenEmails[effectiveEmail] = true
		if emailChanged {
			if exists, err := s.repo.EmailExists(ctx, tenantID, effectiveEmail); err == nil && exists {
				result.Errors = append(result.Errors, "email already in use")
			}
		}
	}

	if isUpdate && row.ProfileKind != existing.row.ProfileKind {
		result.Errors = append(result.Errors, "profile_kind cannot be changed by import; the matched user is a different kind")
	}

	role, roleErr := s.repo.GetRoleBySlug(ctx, tenantID, roleSlug)
	switch {
	case roleErr != nil:
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

	if len(result.Errors) > 0 {
		result.Action = domain.ImportActionError
		return result
	}

	if isUpdate {
		s.finalizeUpdateRow(&result, existing, opts, row, effectiveEmail, roleSlug)
		return result
	}

	hash, hashErr := s.hashInitialPassword(row.Password)
	if hashErr != nil {
		result.Errors = append(result.Errors, hashErr.Error())
		result.Action = domain.ImportActionError
		return result
	}
	result.profile = profile
	result.kind = row.ProfileKind
	result.write = NewUserRecord{
		TenantID: tenantID, Username: username, Email: email, Phone: row.Phone, PasswordHash: hash,
		Name: row.Name, Locale: "id", MustChangePassword: true,
	}
	result.Action = domain.ImportActionCreate
	return result
}

// finalizeUpdateRow merges an update row's provided fields onto the
// matched user's current values (a blank cell means "leave unchanged", not
// "clear the field") and decides whether anything actually changed.
// Username and password are never part of the diff: the row matched on
// username, so it cannot differ, and ValidateImportRow already ignores
// Password for an update row -- this function has nothing to touch even if
// the sheet's password column is filled in.
func (s *Service) finalizeUpdateRow(result *evaluatedRow, existing existingUserMatch, opts ImportOptions, row domain.ImportRow, effectiveEmail, roleSlug string) {
	mergedProfile, profileChanges := mergeProfileFields(existing.profile, row)
	mergedPhone, phoneChanged := mergeStringField(existing.row.Phone, row.Phone)

	var changes []string
	if row.Name != existing.row.Name {
		changes = append(changes, "name")
	}
	if effectiveEmail != existing.row.Email {
		changes = append(changes, "email")
	}
	if phoneChanged {
		changes = append(changes, "phone")
	}
	changes = append(changes, profileChanges...)

	applyRole := opts.Mode == domain.ImportModeUpsert && opts.UpdateRoles && !hasPrimaryRole(existing.roles, roleSlug)
	if applyRole {
		changes = append(changes, "role")
	}

	result.userID = existing.row.ID
	result.name = row.Name
	result.email = effectiveEmail
	result.phone = mergedPhone
	result.locale = existing.row.Locale
	result.kind = existing.row.ProfileKind
	result.profile = mergedProfile
	result.applyRole = applyRole

	result.Changes = changes
	if len(changes) == 0 {
		result.Action = domain.ImportActionUnchanged
	} else {
		result.Action = domain.ImportActionUpdate
	}
}

// hasPrimaryRole reports whether roles already contains slug as the
// primary role, so an update row that would set the same role it already
// has does not report a spurious "role" change.
func hasPrimaryRole(roles []domain.Role, slug string) bool {
	for _, r := range roles {
		if r.IsPrimary {
			return r.Slug == slug
		}
	}
	return false
}

// buildImportProfileFields converts an ImportRow's string columns to
// UserProfileFields, parsing birth_date and the year columns. Format
// errors are returned as row errors rather than silently dropped. Used
// directly for a create row's profile; an update row instead merges the
// same row onto the matched user's existing fields (mergeProfileFields).
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
		if t, err := parseImportBirthDate(row.BirthDate); err == nil {
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

// commitImportRow writes one already-validated row: creates a new user, or
// writes an update's changed fields onto the matched user, or -- for an
// unchanged row -- writes nothing at all.
func (s *Service) commitImportRow(ctx context.Context, tenantID, actorID uuid.UUID, row *evaluatedRow) error {
	switch row.Action {
	case domain.ImportActionUnchanged:
		return nil
	case domain.ImportActionUpdate:
		return s.commitImportRowUpdate(ctx, tenantID, row)
	default:
		return s.commitImportRowCreate(ctx, tenantID, row)
	}
}

func (s *Service) commitImportRowCreate(ctx context.Context, tenantID uuid.UUID, row *evaluatedRow) error {
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

// commitImportRowUpdate writes an update row's merged fields (never the
// username, never the password) and, only when the row is allowed to and
// the resolved role actually differs, replaces the matched user's role
// grant the same way UpdateUser's own role replacement does.
func (s *Service) commitImportRowUpdate(ctx context.Context, tenantID uuid.UUID, row *evaluatedRow) error {
	if err := s.repo.UpdateUserBasic(ctx, tenantID, row.userID, row.name, row.email, row.phone, row.locale); err != nil {
		return fmt.Errorf("update user: %w", err)
	}
	if err := s.writeProfile(ctx, tenantID, row.userID, row.kind, row.profile); err != nil {
		return err
	}
	if row.applyRole {
		if err := s.repo.DeleteUserRoles(ctx, tenantID, row.userID); err != nil {
			return fmt.Errorf("clear user roles: %w", err)
		}
		if err := s.repo.AssignUserRoleRecord(ctx, tenantID, row.userID, row.roleID, true); err != nil {
			return fmt.Errorf("assign role: %w", err)
		}
	}
	return audit.RecordSimple(ctx, tenantID, "user.import_update", "user", row.userID)
}
