package service

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	identitydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// DapodikRowAction is what a Dapodik import row will do (preview) or did
// (commit).
type DapodikRowAction string

const (
	DapodikActionCreate DapodikRowAction = "create"
	DapodikActionUpdate DapodikRowAction = "update"
	DapodikActionError  DapodikRowAction = "error"
)

// dapodikStudentRoleSlug is the role every student Dapodik creates gets.
// It must already exist (roles are seeded per docs/analysis/backend-
// inventory.md section 1.2); the import does not create roles.
const dapodikStudentRoleSlug = authz.RoleSlugStudent

// DapodikRowResult is one row's outcome, returned by both the dry-run
// preview and the commit.
type DapodikRowResult struct {
	RowNumber int
	Name      string
	NISN      string
	ClassName string
	Action    DapodikRowAction
	Errors    []string
}

// dapodikEvaluatedRow carries what evaluate resolved, so commit can act
// without re-matching against the NISN map.
type dapodikEvaluatedRow struct {
	DapodikRowResult
	row            domain.DapodikRow
	existingUserID uuid.UUID
}

// DapodikPreview parses an uploaded Dapodik CSV export and reports, per
// row, what would happen -- create, update (matched by NISN), or an
// error -- without writing anything.
func (s *Service) DapodikPreview(ctx context.Context, tenantID uuid.UUID, file []byte) ([]DapodikRowResult, error) {
	rows, err := domain.ParseDapodikCSV(bytes.NewReader(file))
	if err != nil {
		return nil, err
	}

	var results []DapodikRowResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.ListStudentNISNs(ctx, tenantID)
		if err != nil {
			return err
		}
		seen := map[string]bool{}
		for _, row := range rows {
			results = append(results, s.evaluateDapodikRow(row, existing, seen).DapodikRowResult)
		}
		return nil
	})
	return results, err
}

// DapodikCommit re-parses and re-evaluates the same file (so preview and
// commit never drift, matching apps/api/internal/modules/academic/service/
// import.go's pattern) and applies every row that is not an error: create
// a new student account (and its class, if the rombel does not exist yet)
// or update an existing one's profile fields. Re-running commit with the
// same file is safe -- rows already matched by NISN become no-op updates,
// not duplicate students.
func (s *Service) DapodikCommit(ctx context.Context, tenantID, actorID uuid.UUID, file []byte) ([]DapodikRowResult, error) {
	if s.academic == nil || s.identity == nil {
		return nil, domain.ErrOnboardingUnavailable
	}
	rows, err := domain.ParseDapodikCSV(bytes.NewReader(file))
	if err != nil {
		return nil, err
	}

	var results []DapodikRowResult
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		year, ok, err := s.repo.GetActiveAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNoActiveAcademicYear
		}

		roleID, err := s.resolveStudentRoleID(ctx, tenantID)
		if err != nil {
			return err
		}

		existing, err := s.repo.ListStudentNISNs(ctx, tenantID)
		if err != nil {
			return err
		}
		seen := map[string]bool{}
		var created, updated, failed int
		for _, row := range rows {
			evaluated := s.evaluateDapodikRow(row, existing, seen)
			switch evaluated.Action {
			case DapodikActionCreate:
				if err := s.applyDapodikRow(ctx, tenantID, actorID, year.ID, roleID, evaluated); err != nil {
					return err
				}
				created++
			case DapodikActionUpdate:
				if err := s.applyDapodikRow(ctx, tenantID, actorID, year.ID, roleID, evaluated); err != nil {
					return err
				}
				updated++
			case DapodikActionError:
				failed++
			}
			results = append(results, evaluated.DapodikRowResult)
		}
		return s.repo.RecordDapodikImportBatch(ctx, tenantID, len(rows), created, updated, failed, actorID)
	})
	return results, err
}

// evaluateDapodikRow validates one row and matches it against the tenant's
// existing NISN map. seen tracks NISNs already used earlier in the same
// file, since two rows claiming the same NISN cannot both be "create".
func (s *Service) evaluateDapodikRow(row domain.DapodikRow, existing map[string]uuid.UUID, seen map[string]bool) dapodikEvaluatedRow {
	base := DapodikRowResult{RowNumber: row.RowNumber, Name: row.Name, NISN: row.NISN, ClassName: row.ClassName}

	if errs := row.Validate(); len(errs) > 0 {
		base.Action = DapodikActionError
		base.Errors = errs
		return dapodikEvaluatedRow{DapodikRowResult: base, row: row}
	}
	if seen[row.NISN] {
		base.Action = DapodikActionError
		base.Errors = []string{"duplicate nisn in file"}
		return dapodikEvaluatedRow{DapodikRowResult: base, row: row}
	}
	seen[row.NISN] = true

	if userID, ok := existing[row.NISN]; ok {
		base.Action = DapodikActionUpdate
		return dapodikEvaluatedRow{DapodikRowResult: base, row: row, existingUserID: userID}
	}
	base.Action = DapodikActionCreate
	return dapodikEvaluatedRow{DapodikRowResult: base, row: row}
}

func (s *Service) applyDapodikRow(ctx context.Context, tenantID, actorID, yearID, roleID uuid.UUID, evaluated dapodikEvaluatedRow) error {
	profile := dapodikProfileFields(evaluated.row)

	switch evaluated.Action {
	case DapodikActionCreate:
		classID, err := s.ensureClassForRombel(ctx, tenantID, yearID, evaluated.row.ClassName)
		if err != nil {
			return fmt.Errorf("row %d: %w", evaluated.RowNumber, err)
		}
		created, err := s.identity.CreateUser(ctx, tenantID, actorID, identityservice.CreateUserInput{
			UserWriteInput: identityservice.UserWriteInput{
				Name: evaluated.row.Name, ProfileKind: identitydomain.ProfileStudent, Profile: profile,
				Roles: []identitydomain.RoleGrant{{RoleID: roleID, Slug: dapodikStudentRoleSlug, IsPrimary: true}},
			},
		})
		if err != nil {
			return fmt.Errorf("row %d: create student: %w", evaluated.RowNumber, err)
		}
		if _, err := s.academic.AssignStudent(ctx, tenantID, yearID, created.ID, classID, s.clk.Now()); err != nil {
			return fmt.Errorf("row %d: enroll student: %w", evaluated.RowNumber, err)
		}
	case DapodikActionUpdate:
		if _, err := s.identity.UpdateUser(ctx, tenantID, actorID, evaluated.existingUserID, identityservice.UserWriteInput{
			Name: evaluated.row.Name, ProfileKind: identitydomain.ProfileStudent, Profile: profile,
		}); err != nil {
			return fmt.Errorf("row %d: update student: %w", evaluated.RowNumber, err)
		}
		// Moving an updated student to a different rombel than they
		// already have is deliberately not handled here -- see the
		// module's report for why -- to keep the commit path from also
		// having to reconcile enrollment history on every re-run.
	}
	return nil
}

func dapodikProfileFields(row domain.DapodikRow) identityservice.UserProfileFields {
	gender, _ := row.Gender()
	birthDate, _ := row.BirthDate()
	return identityservice.UserProfileFields{
		Gender:     gender,
		BirthPlace: row.BirthPlace,
		BirthDate:  birthDate,
		NIS:        row.NIPD,
		NISN:       row.NISN,
	}
}

// resolveStudentRoleID looks up the "siswa" role's ID once per commit,
// through identity's own ListRoles rather than a second identity method
// dedicated to slug lookup.
func (s *Service) resolveStudentRoleID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	roles, err := s.identity.ListRoles(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	for _, r := range roles {
		if r.Slug == dapodikStudentRoleSlug {
			return r.ID, nil
		}
	}
	return uuid.Nil, fmt.Errorf("role %q not found for tenant", dapodikStudentRoleSlug)
}

// ensureClassForRombel finds a class named exactly like the Dapodik
// "rombel saat ini" value in the active academic year, or creates one,
// matched to the grade level whose code prefixes the rombel name (e.g.
// "7A" -> grade level "7", "X IPA 1" -> grade level "X"). When no grade
// level's code is a prefix -- an unusual naming scheme this tenant does
// not use the templates for -- it falls back to the tenant's first grade
// level rather than failing the whole row.
func (s *Service) ensureClassForRombel(ctx context.Context, tenantID, yearID uuid.UUID, className string) (uuid.UUID, error) {
	classes, _, err := s.academic.ListClasses(ctx, tenantID, yearID, className, nil, academicservice.Page{Limit: 50})
	if err != nil {
		return uuid.Nil, err
	}
	for _, c := range classes {
		if strings.EqualFold(c.Name, className) {
			return c.ID, nil
		}
	}

	gradeLevelID, err := s.matchGradeLevel(ctx, tenantID, className)
	if err != nil {
		return uuid.Nil, err
	}
	created, err := s.academic.CreateClass(ctx, academicdomain.Class{
		TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID, Name: className,
	})
	if err != nil {
		return uuid.Nil, err
	}
	return created.ID, nil
}

func (s *Service) matchGradeLevel(ctx context.Context, tenantID uuid.UUID, className string) (uuid.UUID, error) {
	levels, err := s.academic.ListGradeLevels(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	if len(levels) == 0 {
		return uuid.Nil, fmt.Errorf("tenant has no grade levels; apply a level template first")
	}
	upper := strings.ToUpper(strings.TrimSpace(className))
	for _, g := range levels {
		if strings.HasPrefix(upper, strings.ToUpper(g.Code)) {
			return g.ID, nil
		}
	}
	return levels[0].ID, nil
}
