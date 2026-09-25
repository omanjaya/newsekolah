// Local aliases for @newsekolah/api-client's generated schema types, kept
// here so every hooks module (and the screens importing from
// "@/lib/api/hooks") shares one source instead of re-deriving them.
import type { components } from "@newsekolah/api-client";

export type Notification = components["schemas"]["Notification"];
export type MyAnnouncement = components["schemas"]["MyAnnouncement"];
export type SessionSummary = components["schemas"]["AttendanceSessionSummary"];
export type SessionDetail = components["schemas"]["AttendanceSessionDetail"];
export type SaveEntriesRequest = components["schemas"]["SaveAttendanceEntriesRequest"];
export type CalendarDay = components["schemas"]["AttendanceCalendarDay"];
export type WorkflowInstance = components["schemas"]["WorkflowInstance"];
export type ExitPermitDetail = components["schemas"]["ExitPermitDetail"];
export type LateArrivalDetail = components["schemas"]["LateArrivalDetail"];
export type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];
export type LeaveRequestDetail = components["schemas"]["LeaveRequestDetail"];
export type IssuedScanToken = components["schemas"]["IssuedScanToken"];
export type ScanPurpose = components["schemas"]["ScanPurpose"];
export type LeaveCategory = components["schemas"]["LeaveCategory"];
export type Period = components["schemas"]["Period"];
export type AttendanceRosterEntry = components["schemas"]["AttendanceRosterEntry"];
export type Journal = components["schemas"]["Journal"];
export type JournalWriteRequest = components["schemas"]["JournalWriteRequest"];
export type Substitution = components["schemas"]["Substitution"];
export type SubstitutionCreateRequest = components["schemas"]["SubstitutionCreateRequest"];
export type LateArrivalSummary = components["schemas"]["LateArrivalSummary"];
export type ScheduleBlock = components["schemas"]["ScheduleBlock"];
export type Room = components["schemas"]["Room"];
export type DirectoryUser = components["schemas"]["DirectoryUser"];
export type MyGrades = components["schemas"]["MyGrades"];
export type MySubjectGrade = components["schemas"]["MySubjectGrade"];

export type LibraryTitle = components["schemas"]["LibraryTitle"];
export type LibraryCopy = components["schemas"]["LibraryCopy"];
export type LibraryCopyCondition = components["schemas"]["LibraryCopyCondition"];
export type LibraryLoan = components["schemas"]["LibraryLoan"];
export type LibraryStocktake = components["schemas"]["LibraryStocktake"];
export type LibraryStocktakeResult = components["schemas"]["LibraryStocktakeResult"];

export const REFERENCE_STALE_MS = 5 * 60 * 1000;
