package http

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// adminErrorMap translates administration domain errors to stable HTTP errors;
// anything not listed falls through to mapAuthError.
var adminErrorMap = map[error]error{
	domain.ErrUserNotFound:                httpx.ErrNotFound,
	domain.ErrRoleNotFound:                httpx.ErrNotFound,
	domain.ErrDutyTypeNotFound:            httpx.ErrNotFound,
	domain.ErrDutyAssignmentNotFound:      httpx.ErrNotFound,
	domain.ErrUserAlreadyExists:           httpx.ErrUserAlreadyExists,
	domain.ErrCannotArchiveSelf:           httpx.ErrUserCannotArchiveSelf,
	domain.ErrOnlySuperAdminGrants:        httpx.ErrOnlySuperAdminCanGrantSuperAdmin,
	domain.ErrNoPrimaryRole:               httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "roles", Code: "PRIMARY_ROLE_REQUIRED"}),
	domain.ErrInvalidProfileKind:          httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "profile_kind", Code: "INVALID"}),
	domain.ErrInvalidRoleSlug:             httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "slug", Code: "INVALID"}),
	domain.ErrRoleSystemImmutable:         httpx.ErrRoleSystemImmutable,
	domain.ErrRoleInUse:                   httpx.ErrRoleInUse,
	domain.ErrUnknownPermission:           httpx.ErrUnknownPermission,
	domain.ErrDutyTypeInUse:               httpx.ErrDutyTypeInUse,
	domain.ErrInvalidScopeKind:            httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "scope_kind", Code: "INVALID"}),
	domain.ErrScopeTargetNotFound:         httpx.ErrValidation.WithDetails(httpx.ErrorDetail{Field: "scope", Code: "TARGET_NOT_FOUND"}),
	domain.ErrCannotImpersonateSelf:       httpx.ErrImpersonationNotAllowed,
	domain.ErrCannotImpersonateSuperAdmin: httpx.ErrImpersonationNotAllowed,
	domain.ErrCannotImpersonateInactive:   httpx.ErrImpersonationNotAllowed,
	domain.ErrNotImpersonating:            httpx.ErrNotImpersonating,
	domain.ErrPasswordResetTokenInvalid:   httpx.ErrPasswordResetTokenInvalid,
	domain.ErrUploadNotConfigured:         httpx.ErrUploadNotConfigured,
	domain.ErrUploadInvalidFileType:       httpx.ErrUploadInvalidFileType,
	domain.ErrUploadObjectNotOwned:        httpx.ErrUploadInvalidFileType,
	domain.ErrUploadFileTooLarge:          httpx.ErrUploadFileTooLarge,
}

func mapAdminError(err error) error {
	for domainErr, httpErr := range adminErrorMap {
		if errors.Is(err, domainErr) {
			return httpErr
		}
	}
	return mapAuthError(err)
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func strOf(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func intOf(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func uuidPtr(n uuid.NullUUID) *openapi_types.UUID {
	if !n.Valid {
		return nil
	}
	v := n.UUID
	return &v
}

func nullUUID(p *openapi_types.UUID) uuid.NullUUID {
	if p == nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: *p, Valid: true}
}

func datePtr(t *time.Time) *openapi_types.Date {
	if t == nil || t.IsZero() {
		return nil
	}
	return &openapi_types.Date{Time: *t}
}

func timeOfDate(d *openapi_types.Date) time.Time {
	if d == nil {
		return time.Time{}
	}
	return d.Time
}

func timePtrOfDate(d *openapi_types.Date) *time.Time {
	if d == nil {
		return nil
	}
	t := d.Time
	return &t
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func toAPIProfile(p service.UserProfileFields) *api.UserProfileFields {
	out := api.UserProfileFields{
		Nik: strPtr(p.NIK), BirthPlace: strPtr(p.BirthPlace), Religion: strPtr(p.Religion),
		Address: strPtr(p.Address), District: strPtr(p.District), City: strPtr(p.City), BloodType: strPtr(p.BloodType),
		Nis: strPtr(p.NIS), Nisn: strPtr(p.NISN), PreviousSchool: strPtr(p.PreviousSchool),
		FatherName: strPtr(p.FatherName), MotherName: strPtr(p.MotherName), GuardianName: strPtr(p.GuardianName),
		GuardianPhone: strPtr(p.GuardianPhone), ParentOccupation: strPtr(p.ParentOccupation),
		Nip: strPtr(p.NIP), Nuptk: strPtr(p.NUPTK), EmploymentStatus: strPtr(p.EmploymentStatus),
		LastEducation: strPtr(p.LastEducation), Specialization: strPtr(p.Specialization),
		EmployeeNumber: strPtr(p.EmployeeNumber), Position: strPtr(p.Position),
	}
	if p.Gender != "" {
		g := api.UserProfileFieldsGender(p.Gender)
		out.Gender = &g
	}
	if !p.BirthDate.IsZero() {
		out.BirthDate = &openapi_types.Date{Time: p.BirthDate}
	}
	if p.EntryYear != 0 {
		v := p.EntryYear
		out.EntryYear = &v
	}
	if p.JoinedYear != 0 {
		v := p.JoinedYear
		out.JoinedYear = &v
	}
	return &out
}

func fromAPIProfile(p *api.UserProfileFields) service.UserProfileFields {
	if p == nil {
		return service.UserProfileFields{}
	}
	out := service.UserProfileFields{
		NIK: strOf(p.Nik), BirthPlace: strOf(p.BirthPlace), BirthDate: timeOfDate(p.BirthDate), Religion: strOf(p.Religion),
		Address: strOf(p.Address), District: strOf(p.District), City: strOf(p.City), BloodType: strOf(p.BloodType),
		NIS: strOf(p.Nis), NISN: strOf(p.Nisn), EntryYear: intOf(p.EntryYear), PreviousSchool: strOf(p.PreviousSchool),
		FatherName: strOf(p.FatherName), MotherName: strOf(p.MotherName), GuardianName: strOf(p.GuardianName),
		GuardianPhone: strOf(p.GuardianPhone), ParentOccupation: strOf(p.ParentOccupation),
		NIP: strOf(p.Nip), NUPTK: strOf(p.Nuptk), EmploymentStatus: strOf(p.EmploymentStatus),
		LastEducation: strOf(p.LastEducation), JoinedYear: intOf(p.JoinedYear), Specialization: strOf(p.Specialization),
		EmployeeNumber: strOf(p.EmployeeNumber), Position: strOf(p.Position),
	}
	if p.Gender != nil {
		out.Gender = string(*p.Gender)
	}
	return out
}

func fromAPIRoleGrants(grants []api.RoleGrant) []domain.RoleGrant {
	out := make([]domain.RoleGrant, len(grants))
	for i, g := range grants {
		out[i] = domain.RoleGrant{RoleID: g.RoleId, IsPrimary: g.IsPrimary != nil && *g.IsPrimary}
	}
	return out
}

func toAPIAdminUser(u service.UserAdminView) api.AdminUser {
	roles := make([]api.Role, len(u.Roles))
	for i, r := range u.Roles {
		roles[i] = toAPIRole(r)
	}
	return api.AdminUser{
		Id: u.ID, Username: u.Username, Email: strPtr(u.Email), Phone: strPtr(u.Phone), Name: u.Name,
		Status: api.UserStatus(u.Status), ProfileKind: api.ProfileKind(u.ProfileKind), Locale: strPtr(u.Locale),
		AvatarUrl: strPtr(u.AvatarURL), MustChangePassword: u.MustChangePassword,
		LastLoginAt: timePtr(u.LastLoginAt), CreatedAt: u.CreatedAt, Roles: roles, Profile: toAPIProfile(u.Profile),
	}
}

func fromAPIUserWrite(w api.UserWriteFields) service.UserWriteInput {
	in := service.UserWriteInput{
		Name: w.Name, Phone: strOf(w.Phone), ProfileKind: domain.ProfileKind(w.ProfileKind),
		Profile: fromAPIProfile(w.Profile), Roles: fromAPIRoleGrants(w.Roles),
	}
	if w.Email != nil {
		in.Email = string(*w.Email)
	}
	if w.Locale != nil {
		in.Locale = string(*w.Locale)
	}
	return in
}

func toAPIAdminRole(r service.RoleView) api.AdminRole {
	perms := r.Permissions
	if perms == nil {
		perms = []string{}
	}
	return api.AdminRole{
		Id: r.ID, Slug: r.Slug, Name: r.Name, Description: strPtr(r.Description),
		IsSystem: r.IsSystem, Permissions: perms, UserCount: r.UserCount,
	}
}

func toAPIDutyType(d service.DutyTypeView) api.DutyType {
	perms := d.Permissions
	if perms == nil {
		perms = []string{}
	}
	return api.DutyType{
		Id: d.ID, Slug: d.Slug, Name: d.Name, ScopeKind: api.DutyScopeKind(d.ScopeKind),
		IsActive: d.IsActive, Permissions: perms,
	}
}

func toAPIDutyAssignment(a service.DutyAssignmentRecord) api.DutyAssignment {
	return api.DutyAssignment{
		Id: a.ID, AcademicYearId: a.AcademicYearID, DutyTypeId: a.DutyTypeID, DutySlug: a.DutySlug, DutyName: a.DutyName,
		UserId: a.UserID, ScopeClassId: uuidPtr(a.ScopeClassID), ScopeStudentId: uuidPtr(a.ScopeStudentID),
		IsActive: a.IsActive, StartsOn: openapi_types.Date{Time: a.StartsOn}, EndsOn: datePtr(a.EndsOn),
	}
}

func toAPIAuditEntry(r service.AuditLogRecord) api.AuditLogEntry {
	entry := api.AuditLogEntry{
		Id: r.ID, ActorUserId: uuidPtr(r.ActorUserID), ActingAsUserId: uuidPtr(r.ActingAsUserID),
		Action: r.Action, EntityType: r.EntityType, EntityId: uuidPtr(r.EntityID),
		Ip: strPtr(r.IP), UserAgent: strPtr(r.UserAgent), RequestId: strPtr(r.RequestID), OccurredAt: r.OccurredAt,
	}
	entry.Before = jsonObject(r.Before)
	entry.After = jsonObject(r.After)
	return entry
}

func jsonObject(raw []byte) *map[string]interface{} {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return &m
}
