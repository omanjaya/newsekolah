package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// fakeAcademic is an in-memory stand-in for AcademicPort, just enough to
// exercise the onboarding wizard's idempotency rules without a database:
// every "create" call records the row, and a second call with the same
// code/sequence is expected to be skipped by the caller before it ever
// reaches here (the fake itself does not dedupe, so a test catching a
// duplicate create call is a real bug, not a fake quirk).
type fakeAcademic struct {
	gradeLevels     []academicdomain.GradeLevel
	subjects        []academicdomain.Subject
	periodTemplates []academicdomain.PeriodTemplate
	periods         map[uuid.UUID][]academicdomain.Period
	classes         []academicdomain.Class
}

func newFakeAcademic() *fakeAcademic {
	return &fakeAcademic{periods: map[uuid.UUID][]academicdomain.Period{}}
}

func (f *fakeAcademic) ApplyGradeLevelTemplate(_ context.Context, tenantID uuid.UUID, template string) ([]academicdomain.GradeLevel, error) {
	rows, err := academicdomain.GradeLevelTemplateRows(template)
	if err != nil {
		return nil, err
	}
	have := map[string]bool{}
	for _, g := range f.gradeLevels {
		have[g.Code] = true
	}
	var created []academicdomain.GradeLevel
	for _, row := range rows {
		if have[row.Code] {
			continue
		}
		g := academicdomain.GradeLevel{ID: uuid.New(), TenantID: tenantID, Code: row.Code, Name: row.Name, Sequence: row.Sequence}
		f.gradeLevels = append(f.gradeLevels, g)
		created = append(created, g)
	}
	return created, nil
}

func (f *fakeAcademic) ListGradeLevels(_ context.Context, _ uuid.UUID) ([]academicdomain.GradeLevel, error) {
	return f.gradeLevels, nil
}

func (f *fakeAcademic) ListSubjects(_ context.Context, _ uuid.UUID, _ string, _ academicservice.Page) ([]academicdomain.Subject, int64, error) {
	return f.subjects, int64(len(f.subjects)), nil
}

func (f *fakeAcademic) CreateSubject(_ context.Context, tenantID uuid.UUID, code, name string) (academicdomain.Subject, error) {
	for _, s := range f.subjects {
		if s.Code == code {
			return academicdomain.Subject{}, errors.New("subject code already exists")
		}
	}
	s := academicdomain.Subject{ID: uuid.New(), TenantID: tenantID, Code: code, Name: name}
	f.subjects = append(f.subjects, s)
	return s, nil
}

func (f *fakeAcademic) ListPeriodTemplates(_ context.Context, _ uuid.UUID) ([]academicdomain.PeriodTemplate, error) {
	return f.periodTemplates, nil
}

func (f *fakeAcademic) CreatePeriodTemplate(_ context.Context, tenantID uuid.UUID, name string, isDefault bool) (academicdomain.PeriodTemplate, error) {
	t := academicdomain.PeriodTemplate{ID: uuid.New(), TenantID: tenantID, Name: name, IsDefault: isDefault}
	f.periodTemplates = append(f.periodTemplates, t)
	return t, nil
}

func (f *fakeAcademic) ListPeriods(_ context.Context, _, templateID uuid.UUID) ([]academicdomain.Period, error) {
	return f.periods[templateID], nil
}

func (f *fakeAcademic) CreatePeriod(_ context.Context, p academicdomain.Period) (academicdomain.Period, error) {
	for _, existing := range f.periods[p.TemplateID] {
		if existing.Sequence == p.Sequence {
			return academicdomain.Period{}, errors.New("period sequence already exists")
		}
	}
	p.ID = uuid.New()
	f.periods[p.TemplateID] = append(f.periods[p.TemplateID], p)
	return p, nil
}

func (f *fakeAcademic) ListClasses(_ context.Context, _, _ uuid.UUID, search string, _ *uuid.UUID, _ academicservice.Page) ([]academicdomain.Class, int64, error) {
	var out []academicdomain.Class
	for _, c := range f.classes {
		if search == "" || c.Name == search {
			out = append(out, c)
		}
	}
	return out, int64(len(out)), nil
}

func (f *fakeAcademic) CreateClass(_ context.Context, c academicdomain.Class) (academicdomain.Class, error) {
	c.ID = uuid.New()
	f.classes = append(f.classes, c)
	return c, nil
}

func (f *fakeAcademic) AssignStudent(_ context.Context, tenantID, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (academicdomain.Enrollment, error) {
	return academicdomain.Enrollment{ID: uuid.New(), TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID, ClassID: classID, JoinedOn: joinedOn, Status: academicdomain.EnrollmentStatusActive}, nil
}

func (f *fakeAcademic) MoveStudent(_ context.Context, tenantID, yearID, studentID, toClassID uuid.UUID, effectiveOn time.Time) (academicdomain.Enrollment, error) {
	return academicdomain.Enrollment{ID: uuid.New(), TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID, ClassID: toClassID, JoinedOn: effectiveOn, Status: academicdomain.EnrollmentStatusActive}, nil
}

// fakeIdentity is an in-memory stand-in for IdentityPort.
type fakeIdentity struct {
	roleID uuid.UUID
	users  map[uuid.UUID]identityservice.UserAdminView
}

func newFakeIdentity() *fakeIdentity {
	return &fakeIdentity{roleID: uuid.New(), users: map[uuid.UUID]identityservice.UserAdminView{}}
}

func (f *fakeIdentity) ListRoles(_ context.Context, _ uuid.UUID) ([]identityservice.RoleView, error) {
	return []identityservice.RoleView{{RoleRecord: identityservice.RoleRecord{ID: f.roleID, Slug: dapodikStudentRoleSlug, Name: "Siswa"}}}, nil
}

func (f *fakeIdentity) CreateUser(_ context.Context, _, _ uuid.UUID, in identityservice.CreateUserInput) (identityservice.UserAdminView, error) {
	for _, u := range f.users {
		if u.Profile.NISN != "" && u.Profile.NISN == in.Profile.NISN {
			return identityservice.UserAdminView{}, errors.New("nisn already in use")
		}
	}
	view := identityservice.UserAdminView{ID: uuid.New(), Name: in.Name, ProfileKind: in.ProfileKind, Profile: in.Profile}
	f.users[view.ID] = view
	return view, nil
}

func (f *fakeIdentity) UpdateUser(_ context.Context, _, _, userID uuid.UUID, in identityservice.UserWriteInput) (identityservice.UserAdminView, error) {
	view, ok := f.users[userID]
	if !ok {
		return identityservice.UserAdminView{}, errors.New("user not found")
	}
	view.Name = in.Name
	view.Profile = in.Profile
	f.users[userID] = view
	return view, nil
}
