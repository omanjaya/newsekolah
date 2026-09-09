package authz

const (
	// PermPlatformSuperadmin gates every operation of the cross-tenant
	// platform console (docs/12-roadmap.md Fase 3): it must never be
	// granted to a tenant's own administrator role.
	PermPlatformSuperadmin = "platform_superadmin"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermPlatformSuperadmin, "platform", "Operate the cross-tenant platform console: manage tenants, module flags, and exports"},
	)
}
