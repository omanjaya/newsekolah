import { ownExitRefusalKey } from "@/lib/permits/exit-permit";
import { setLocale, t } from "@/i18n/t";

// The shared catalog's "Siswa ini ..." is worded for the duty teacher
// recording a permit for someone else; the student's own request is
// refused in words addressed to the student.
describe("ownExitRefusalKey", () => {
  beforeEach(() => {
    setLocale("id");
  });

  it("speaks to the student when they are on leave today", () => {
    const key = ownExitRefusalKey("STUDENT_ON_LEAVE_TODAY");
    expect(key).toBe("permits.on_leave_today");
    expect(key && t(key)).toBe(
      "Anda sudah memiliki surat izin tidak masuk untuk hari ini, jadi tidak bisa mengajukan izin keluar.",
    );
  });

  it("speaks to the student when they already have an exit permit today", () => {
    const key = ownExitRefusalKey("EXIT_PERMIT_ALREADY_TODAY");
    expect(key).toBe("permits.already_today");
    expect(key && t(key)).toBe("Anda sudah memiliki izin keluar hari ini.");
  });

  it("leaves every other error to the shared catalog", () => {
    expect(ownExitRefusalKey("WORKFLOW_ALREADY_IN_PROGRESS")).toBeNull();
    expect(ownExitRefusalKey(undefined)).toBeNull();
  });
});
