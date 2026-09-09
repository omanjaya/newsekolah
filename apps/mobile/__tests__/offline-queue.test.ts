import { MutationQueue, computeBackoffMs, type QueueDatabase } from "@/lib/offline/queue";
import { request } from "@/lib/api";

jest.mock("@/lib/api", () => ({ request: jest.fn() }));

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
  attempts: number;
  next_attempt_at: number;
  created_at: number;
  last_error: string | null;
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
      } else if (sql.startsWith("UPDATE")) {
        const [attempts, nextAttemptAt, lastError, id] = params as [number, number, string, string];
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.attempts = attempts;
          row.next_attempt_at = nextAttemptAt;
          row.last_error = lastError;
        }
      }
      return Promise.resolve(undefined);
    },
    getAllAsync: <T>() => Promise.resolve([...rows] as unknown as T[]),
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
    const pending = await queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.idempotencyKey).toBe(mutation.idempotencyKey);
  });

  it("removes a mutation from the queue once it sends successfully", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    (request as jest.Mock).mockResolvedValueOnce({ ok: true });

    await queue.enqueue("POST", "/v1/attendance", { status: "present" });
    const result = await queue.flush(() => Promise.resolve(true));

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(await queue.pending()).toHaveLength(0);
  });

  it("reuses the same idempotency key when a failed mutation is retried", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    (request as jest.Mock).mockRejectedValueOnce(new Error("network down"));

    const enqueued = await queue.enqueue("POST", "/v1/attendance", { status: "present" });
    await queue.flush(() => Promise.resolve(true));

    const [pending] = await queue.pending();
    expect(pending?.idempotencyKey).toBe(enqueued.idempotencyKey);
    expect(pending?.attempts).toBe(1);
    expect(pending?.nextAttemptAt).toBeGreaterThan(Date.now());

    const [, callOptions] = (request as jest.Mock).mock.calls[0] as [
      string,
      { idempotencyKey: string },
    ];
    expect(callOptions.idempotencyKey).toBe(enqueued.idempotencyKey);
  });

  it("never sends when the online check reports offline", async () => {
    const queue = new MutationQueue(createFakeDatabase());
    await queue.enqueue("POST", "/v1/attendance", { status: "present" });

    const result = await queue.flush(() => Promise.resolve(false));

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(request).not.toHaveBeenCalled();
  });

  it("computes an exponential backoff capped at 5 minutes", () => {
    expect(computeBackoffMs(0)).toBe(2000);
    expect(computeBackoffMs(1)).toBe(4000);
    expect(computeBackoffMs(2)).toBe(8000);
    expect(computeBackoffMs(20)).toBe(5 * 60 * 1000);
  });
});
