/**
 * One student's early-warning detail (/analytics/[id]), the page the
 * early-warning list opens and whose breadcrumb leads back to it.
 */
export function studentRiskHref(studentId: string): string {
  return `/analytics/${encodeURIComponent(studentId)}`;
}
