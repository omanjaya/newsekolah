import { ApiError } from "@newsekolah/api-client";
import { MutationQueue, computeBackoffMs, type QueueDatabase } from "@/lib/offline/queue";
import { rawMutate } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({ rawMutate: jest.fn() }));

let uuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${String((uuidCounter += 1))}`,
}));

interface Row {
  id: string;
  method: string;
  path: string;
  body: string;
  idempotency_key: string;
  status: string;
  attempts: number;
  next_attempt_at: number;
  created_at: number;
  last_error: string | null;
}

function conflictError(): ApiError {
  return new ApiError({ status: 409, code: "CONFLICT", message: "already submitted" });
}

function unknownBarcodeError(): ApiError {
  return new ApiError({
    status: 404,
    code: "LIBRARY_COPY_NOT_FOUND",
    message: "no copy matches this barcode",
  });
}

/** In-memory stand-in for expo-sqlite: real SQL parsing is overkill for a
 * unit test, so this matches the handful of fixed statements queue.ts
 * actually issues. */
function createFakeDatabase(): QueueDatabase {
  const rows: Row[] = [];

  return {
    execAsync: () => Promise.resolve(undefined),
    runAsync: (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("INSERT")) {
        const [
          id,
          method,
          path,
          body,
          idempotencyKey,
          status,
          attempts,
          nextAttemptAt,
          createdAt,
          lastError,
        ] = params as [
          string,
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          number,
          string | null,
        ];
        rows.push({
          id,
          method,
          path,
          body,
          idempotency_key: idempotencyKey,
          status,
          attempts,
          next_attempt_at: nextAttemptAt,
          created_at: createdAt,
          last_error: lastError,
        });
      } else if (sql.startsWith("DELETE FROM mutation_queue WHERE id")) {
        const [id] = params as [string];
        const index = rows.findIndex((row) => row.id === id);
        if (index !== -1) rows.splice(index, 1);
      } else if (sql.startsWith("DELETE FROM mutation_queue")) {
        rows.length = 0;
      } else if (sql.startsWith("UPDATE mutation_queue SET attempts")) {
        const [attempts, nextAttemptAt, lastError, id] = params as [number, number, string, string];
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.attempts = attempts;
          row.next_attempt_at = nextAttemptAt;
          row.last_error = lastError;
        }
      } else if (sql.startsWith("UPDATE mutation_queue SET status = 'conflict'")) {
        const [lastError, id] = params as [string, string];
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.status = "conflict";
          row.last_error = lastError;
        }
      } else if (sql.startsWith("UPDATE mutation_queue SET status = 'pending'")) {
        const [nextAttemptAt, id] = params as [number, string];
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.status = "pending";
          row.attempts = 0;
          row.next_attempt_at = nextAttemptAt;
          row.last_error = null;
        }
      }
      return Promise.resolve(undefined);
    },
    getAllAsync: <T>(sql: string) => {
      let result = rows;
      if (sql.includes("status = 'pending'")) result = rows.filter((r) => r.status === "pending");
      if (sql.includes("status = 'conflict'")) result = rows.filter((r) => r.status === "conflict");
      return Promise.resolve([...result] as unknown as T[]);
    },
  };
}

describe("offline mutation queue", () => {
  beforeEach(() => {
    uuidCounter = 0;
    jest.clearAllMocks();
  });

  it("enqueues a mutation with its own idempotency key and keeps it across retries", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    const mutation = await queue.enqueue("POST", "/v1/attendance", { status: "present" });

    expect(mutation.idempotencyKey).toBe("uuid-2"); // uuid-1 is the row id
    expect(mutation.status).toBe("pending");
    const pending = await queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.idempotencyKey).toBe(mutation.idempotencyKey);
  });

  it("removes a mutation from the queue once it sends successfully", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    (rawMutate as jest.Mock).mockResolvedValueOnce({ ok: true });

    await queue.enqueue("POST", "/v1/attendance", { status: "present" });
    const result = await queue.flush(() => Promise.resolve(true));

    expect(result).toEqual({ sent: 1, failed: 0, conflicted: 0 });
    expect(await queue.pending()).toHaveLength(0);
  });

  it("reuses the same idempotency key when a failed mutation is retried", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    (rawMutate as jest.Mock).mockRejectedValueOnce(new Error("network down"));

    const enqueued = await queue.enqueue("POST", "/v1/attendance", { status: "present" });
    await queue.flush(() => Promise.resolve(true));

    const [pending] = await queue.pending();
    expect(pending?.idempotencyKey).toBe(enqueued.idempotencyKey);
    expect(pending?.attempts).toBe(1);
    expect(pending?.nextAttemptAt).toBeGreaterThan(Date.now());

    const [, , , idempotencyKey] = (rawMutate as jest.Mock).mock.calls[0] as [
      string,
      string,
      unknown,
      string,
    ];
    expect(idempotencyKey).toBe(enqueued.idempotencyKey);
  });

  it("never sends when the online check reports offline", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    await queue.enqueue("POST", "/v1/attendance", { status: "present" });

    const result = await queue.flush(() => Promise.resolve(false));

    expect(result).toEqual({ sent: 0, failed: 0, conflicted: 0 });
    expect(rawMutate).not.toHaveBeenCalled();
  });

  it("computes an exponential backoff capped at 5 minutes", () => {
    expect(computeBackoffMs(0)).toBe(2000);
    expect(computeBackoffMs(1)).toBe(4000);
    expect(computeBackoffMs(2)).toBe(8000);
    expect(computeBackoffMs(20)).toBe(5 * 60 * 1000);
  });

  describe("conflicts", () => {
    it("parks a mutation as a conflict on 409 instead of retrying it", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(conflictError());

      await queue.enqueue("PUT", "/v1/attendance/sessions/s1/entries", { mode: "normal" });
      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 0, failed: 0, conflicted: 1 });
      // A conflict is not retried automatically: it drops out of pending().
      expect(await queue.pending()).toHaveLength(0);
      const [conflict] = await queue.conflicts();
      expect(conflict?.status).toBe("conflict");
      expect(conflict?.lastError).toContain("already submitted");
    });

    it("does not attempt a conflicted mutation again on the next flush", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(conflictError());

      await queue.enqueue("PUT", "/v1/attendance/sessions/s1/entries", { mode: "normal" });
      await queue.flush(() => Promise.resolve(true));
      jest.clearAllMocks();

      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 0, failed: 0, conflicted: 0 });
      expect(rawMutate).not.toHaveBeenCalled();
    });

    it("discarding a conflict removes it from the queue for good", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(conflictError());

      const mutation = await queue.enqueue("PUT", "/v1/attendance/sessions/s1/entries", {
        mode: "normal",
      });
      await queue.flush(() => Promise.resolve(true));

      await queue.resolveConflict(mutation.id, "discard");

      expect(await queue.conflicts()).toHaveLength(0);
      expect(await queue.pending()).toHaveLength(0);
    });

    it("retrying a conflict puts it back into pending for the next flush", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(conflictError());

      const mutation = await queue.enqueue("PUT", "/v1/attendance/sessions/s1/entries", {
        mode: "normal",
      });
      await queue.flush(() => Promise.resolve(true));

      await queue.resolveConflict(mutation.id, "retry");

      expect(await queue.conflicts()).toHaveLength(0);
      const [pending] = await queue.pending();
      expect(pending?.id).toBe(mutation.id);
      expect(pending?.attempts).toBe(0);

      (rawMutate as jest.Mock).mockResolvedValueOnce({ ok: true });
      const result = await queue.flush(() => Promise.resolve(true));
      expect(result).toEqual({ sent: 1, failed: 0, conflicted: 0 });
    });

    it("treats a plain network failure as retryable, not a conflict", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));

      await queue.enqueue("PUT", "/v1/attendance/sessions/s1/entries", { mode: "normal" });
      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 0, failed: 1, conflicted: 0 });
      expect(await queue.conflicts()).toHaveLength(0);
      expect(await queue.pending()).toHaveLength(1);
    });
  });

  describe("enqueueOrReplace", () => {
    it("collapses a repeated save of the same session into the latest attempt", async () => {
      const queue = new MutationQueue(createFakeDatabase());

      await queue.enqueueOrReplace("PUT", "/v1/attendance/sessions/s1/entries", {
        entries: ["first"],
      });
      const second = await queue.enqueueOrReplace("PUT", "/v1/attendance/sessions/s1/entries", {
        entries: ["second"],
      });

      const pending = await queue.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(second.id);
      expect(pending[0]?.body).toEqual({ entries: ["second"] });
    });

    it("does not touch a queued mutation for a different path", async () => {
      const queue = new MutationQueue(createFakeDatabase());

      await queue.enqueueOrReplace("PUT", "/v1/attendance/sessions/s1/entries", { entries: [] });
      await queue.enqueueOrReplace("PUT", "/v1/attendance/sessions/s2/entries", { entries: [] });

      expect(await queue.pending()).toHaveLength(2);
    });
  });

  /**
   * A library stocktake session walks the shelves scanning barcodes with
   * no expectation of a live connection (docs/12-roadmap.md Fase 4) --
   * app/library/opname/[stocktakeId].tsx enqueues every scan through this
   * same queue instead of a second offline mechanism. These tests cover
   * that path end to end: a scan persists locally immediately, and one the
   * server rejects because its barcode matches no copy (404,
   * LIBRARY_COPY_NOT_FOUND) is parked for a person instead of retried
   * forever, exactly like a 409 attendance conflict.
   */
  describe("library stocktake scans", () => {
    const STOCKTAKE_PATH = "/v1/library/stocktakes/st-1/scans";

    it("persists a scan locally the moment it is made, marked pending", async () => {
      const queue = new MutationQueue(createFakeDatabase());

      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "BC-001" });

      const pending = await queue.pending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.path).toBe(STOCKTAKE_PATH);
      expect(pending[0]?.body).toEqual({ barcode: "BC-001" });
      expect(pending[0]?.status).toBe("pending");
    });

    it("sends every queued scan once the connection returns", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockResolvedValueOnce({ id: "scan-1" });

      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "BC-001" });
      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 1, failed: 0, conflicted: 0 });
      expect(await queue.pending()).toHaveLength(0);
    });

    it("parks a scan of an unrecognised barcode as a conflict instead of retrying it forever", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(unknownBarcodeError());

      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "NOT-A-COPY" });
      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 0, failed: 0, conflicted: 1 });
      expect(await queue.pending()).toHaveLength(0);
      const [conflict] = await queue.conflicts();
      expect(conflict?.status).toBe("conflict");
      expect(conflict?.body).toEqual({ barcode: "NOT-A-COPY" });
      expect(conflict?.lastError).toContain("no copy matches this barcode");
    });

    it("does not keep retrying a rejected scan on later flushes", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(unknownBarcodeError());

      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "NOT-A-COPY" });
      await queue.flush(() => Promise.resolve(true));
      jest.clearAllMocks();

      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 0, failed: 0, conflicted: 0 });
      expect(rawMutate).not.toHaveBeenCalled();
    });

    it("lets a person retry a rejected scan once the underlying problem is fixed", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(unknownBarcodeError());

      const scan = await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "BC-002" });
      await queue.flush(() => Promise.resolve(true));

      await queue.resolveConflict(scan.id, "retry");
      expect(await queue.conflicts()).toHaveLength(0);

      (rawMutate as jest.Mock).mockResolvedValueOnce({ id: "scan-2" });
      const result = await queue.flush(() => Promise.resolve(true));
      expect(result).toEqual({ sent: 1, failed: 0, conflicted: 0 });
    });

    it("does not confuse a plain network failure while scanning with a rejected barcode", async () => {
      const queue = new MutationQueue(createFakeDatabase());
      (rawMutate as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));

      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "BC-003" });
      const result = await queue.flush(() => Promise.resolve(true));

      expect(result).toEqual({ sent: 0, failed: 1, conflicted: 0 });
      expect(await queue.conflicts()).toHaveLength(0);
      expect(await queue.pending()).toHaveLength(1);
    });

    it("keeps two distinct scans in the same session independent of each other", async () => {
      const queue = new MutationQueue(createFakeDatabase());

      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "BC-001" });
      await queue.enqueue("POST", STOCKTAKE_PATH, { barcode: "BC-002" });

      const pending = await queue.pending();
      expect(pending).toHaveLength(2);
      expect(pending.map((m) => (m.body as { barcode: string }).barcode).sort()).toEqual([
        "BC-001",
        "BC-002",
      ]);
    });
  });
});
