/**
 * Refuses to run the simulation against a host it must never touch:
 * production (sion.nouma.id, docs/README-vps deployment) or any host the
 * caller explicitly forbids via SIM_FORBIDDEN_HOSTS. Called once from
 * fixtures.ts's worker-scoped setup, before any browser context opens, so
 * a misconfigured SIM_BASE_URL fails loudly instead of quietly running
 * real actions against a real school.
 */
const ALWAYS_FORBIDDEN_HOSTS = ["sion.nouma.id"];

export function assertBaseUrlAllowed(baseUrl: string): void {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`SIM_BASE_URL is not a valid URL: "${baseUrl}"`);
  }

  const extraForbidden = (process.env.SIM_FORBIDDEN_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const forbidden = new Set([...ALWAYS_FORBIDDEN_HOSTS, ...extraForbidden]);

  if (forbidden.has(host)) {
    throw new Error(
      `Refusing to run the simulation against "${host}": it is a forbidden host ` +
        `(production or explicitly listed in SIM_FORBIDDEN_HOSTS). Point SIM_BASE_URL ` +
        `at a local dev stack (http://localhost:3000, pnpm dev:docker) or a disposable ` +
        `staging box instead.`,
    );
  }
}
