package domain

// MemberTypeDefault is one of the standard library member types a tenant
// is seeded with. cmd/seed (the local demo tenant) and a real tenant's
// bootstrap (internal/platform/migrator.EnsureTenantDefaults) both build
// their library_member_types rows from here so the two never disagree on
// the numbers.
//
// This exists because library is a core module, enabled by default for
// every tenant (platform/domain.AllModules, feature_flags is opt-out --
// see platform/service.IsModuleEnabled), yet registering a library member
// -- by hand, in bulk, or through auto-registration on first borrow --
// always resolves an existing library_member_types row (service/members.go
// GetMemberType / GetMemberTypeByRole); a tenant with zero member types
// cannot register a single one by any path.
type MemberTypeDefault struct {
	Name           string
	DefaultForRole string
	MaxLoanItems   int
	MaxLoanDays    int
	RenewalDays    int
	MaxRenewals    int
	SuspendDays    int
	ValidityMonths int
}

// MemberTypeDefaults returns the tenant's default library member types:
// one for students, one for teachers and staff, matching the old SION
// app's own defaults.
func MemberTypeDefaults() []MemberTypeDefault {
	return []MemberTypeDefault{
		{Name: "Siswa", DefaultForRole: "student", MaxLoanItems: 2, MaxLoanDays: 7, RenewalDays: 7, MaxRenewals: 1, SuspendDays: 3, ValidityMonths: 12},
		{Name: "Guru & Staf", DefaultForRole: "teacher", MaxLoanItems: 5, MaxLoanDays: 14, RenewalDays: 14, MaxRenewals: 2, SuspendDays: 0, ValidityMonths: 24},
	}
}
