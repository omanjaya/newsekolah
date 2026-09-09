/** Liveness probe for the Docker healthcheck; no dependencies to check server-side. */
export function GET() {
  return Response.json({ status: "ok" });
}
