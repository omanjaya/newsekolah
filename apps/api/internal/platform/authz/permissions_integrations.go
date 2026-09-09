package authz

// Integrations permissions gate the API key and webhook console (Fase 5,
// docs/12-roadmap.md): machine access to the API, as opposed to the human
// sessions every other permission in Catalog governs.
const (
	PermViewIntegrations   = "view_integrations"
	PermManageIntegrations = "manage_integrations"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewIntegrations, "integrations", "View API keys, webhook endpoints, and delivery logs"},
		Permission{PermManageIntegrations, "integrations", "Create and revoke API keys; register and manage webhook endpoints"},
	)
}
