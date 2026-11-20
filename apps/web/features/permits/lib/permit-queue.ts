import type { ExitPermitSummary, LateArrivalSummary, LeaveRequestSummary } from "../api";

interface QueueRow {
  id: string;
  studentId: string;
  studentName: string;
  /** The student's class, when the summary names it. */
  className?: string;
  openedAt: string;
  description: string;
  status: LeaveRequestSummary["status"];
}
export type PermitQueueRow = QueueRow &
  (
    | { type: "leave"; leave: LeaveRequestSummary }
    | { type: "exit"; exit: ExitPermitSummary }
    | { type: "late"; late: LateArrivalSummary }
  );

/** Deduplicate overlapping reviewer queues without mixing workflow identities. */
export function mergePermitQueues({
  leave = [],
  exit = [],
  late = [],
}: {
  leave?: LeaveRequestSummary[];
  exit?: ExitPermitSummary[];
  late?: LateArrivalSummary[];
}): PermitQueueRow[] {
  const rows: PermitQueueRow[] = [
    ...leave.map((item): PermitQueueRow => ({
      type: "leave",
      id: item.instance_id,
      studentId: item.student_user_id,
      studentName: item.student_name,
      className: item.class_name,
      openedAt: item.opened_at,
      description: item.reason ?? "",
      status: item.status,
      leave: item,
    })),
    ...exit.map((item): PermitQueueRow => ({
      type: "exit",
      id: item.instance_id,
      studentId: item.student_user_id,
      studentName: item.student_name ?? "",
      className: item.class_name,
      openedAt: item.opened_at,
      description: item.destination,
      status: item.status,
      exit: item,
    })),
    ...late.map((item): PermitQueueRow => ({
      type: "late",
      id: item.instance_id,
      studentId: item.student_user_id,
      studentName: "",
      className: item.class_name,
      openedAt: item.opened_at,
      description: item.reason,
      status: item.status,
      late: item,
    })),
  ];
  return [...new Map(rows.map((row) => [`${row.type}:${row.id}`, row])).values()].sort((a, b) =>
    a.openedAt.localeCompare(b.openedAt),
  );
}
