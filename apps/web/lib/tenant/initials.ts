/**
 * Shared by the branding-icon route handler and TenantBrand so the
 * generated icon and the in-app brand mark always agree on the same
 * initials for a tenant with no logo.
 */
export function initialsFor(name: string): string {
  const [first, second] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return "SI";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}
