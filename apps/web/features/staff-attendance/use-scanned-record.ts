import { useCallback, useState } from "react";

import type { AttendanceRecord } from "./api";

interface Scan {
  record: AttendanceRecord;
  at: number;
}

/**
 * Today's record for the employee's own check-in, preferring the scan
 * response only while it is newer than the server's copy. The scan shows at
 * once while the my-history refetch is in flight; once a refetch completes
 * after it, the server's row wins, so a later re-judgement (an admin saving
 * a first schedule turns "unscheduled" into "late") is not hidden behind
 * the scan response for as long as the page stays open.
 *
 * `serverUpdatedAt` is the history query's `dataUpdatedAt`.
 */
export function useScannedRecord(
  today: string,
  serverRecord: AttendanceRecord | null,
  serverUpdatedAt: number,
): [AttendanceRecord | null, (saved: AttendanceRecord) => void] {
  const [scan, setScan] = useState<Scan | null>(null);
  const remember = useCallback((saved: AttendanceRecord) => {
    setScan({ record: saved, at: Date.now() });
  }, []);
  const fresh = scan !== null && scan.record.date === today && scan.at >= serverUpdatedAt;
  return [fresh ? scan.record : serverRecord, remember];
}
