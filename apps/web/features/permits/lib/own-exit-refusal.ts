/**
 * The `app.permits.exit.form` key for a refusal of the student's own exit
 * permit request, worded to the student, or null to use the shared error
 * catalog. That catalog says "Siswa ini ...", which reads right for the
 * duty teacher recording a permit for someone else (the same codes reach
 * duty-manual-record-panel.tsx) but not for the student submitting their
 * own. The mobile app keeps the same mapping (apps/mobile/src/lib/permits).
 */
export function ownExitRefusalKey(code: string): "onLeaveToday" | "alreadyToday" | null {
  switch (code) {
    case "STUDENT_ON_LEAVE_TODAY":
      return "onLeaveToday";
    case "EXIT_PERMIT_ALREADY_TODAY":
      return "alreadyToday";
    default:
      return null;
  }
}
