import type { ExitPermitSummary, LateArrivalSummary, LeaveRequestSummary } from "../api";

interface QueueRow {
  id: string;
  studentId: string;
  studentName: string;
  /** Only available for leave and exit (their summaries carry it); late arrivals have none. */
  className?: string;
  openedAt: string;
  description: string;
  status: LeaveRequestSummary["status"];
}
export type PermitQueueRow = QueueRow &
  ({ type: "leave" | "exit" } | { type: "late"; late: LateArrivalSummary });

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
    })),
    ...late.map((item): PermitQueueRow => ({
      type: "late",
      id: item.instance_id,
      studentId: item.student_user_id,
      studentName: "",
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
