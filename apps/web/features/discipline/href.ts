/**
 * One student's discipline record for staff (/discipline/students/[id]),
 * the page the Pelanggaran and Surat peringatan lists open and whose
 * breadcrumb leads back to them.
 */
export function studentDisciplineHref(studentId: string): string {
  return `/discipline/students/${encodeURIComponent(studentId)}`;
}
