// SQLite-backed queue for mutations made while offline (teacher attendance,
// library scan opname -- see docs/10-mobile-strategy.md section 3). Each
// mutation keeps one Idempotency-Key for its whole lifetime so a retry after
// a flaky network never double-applies on the server. The retry/backoff
// policy here is mobile-only; @newsekolah/api-client has no offline queue of
// its own, this just sends queued mutations through its client via
// rawMutate (see lib/api/client.ts).

import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { rawMutate } from "@/lib/api/client";

const DB_NAME = "newsekolah-offline.db";
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 2000;

export type QueuedMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export interface QueuedMutation {
  id: string;
  method: QueuedMethod;
  path: string;
  body: unknown;
  idempotencyKey: string;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError: string | null;
}

interface QueueRow {
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

/** The subset of expo-sqlite's SQLiteDatabase this module needs. Narrowed to
 * an interface so tests can supply an in-memory fake instead of the native
 * module. */
export interface QueueDatabase {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: unknown[]) => Promise<unknown>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS mutation_queue (
    id TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    body TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_error TEXT
  );
`;

function rowToMutation(row: QueueRow): QueuedMutation {
  return {
    id: row.id,
    method: row.method as QueuedMethod,
    path: row.path,
    body: JSON.parse(row.body) as unknown,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    lastError: row.last_error,
  };
}

/** attempts=0 -> 2s, 1 -> 4s, 2 -> 8s, ... capped at MAX_BACKOFF_MS. */
export function computeBackoffMs(attempts: number): number {
  const delay = BASE_BACKOFF_MS * Math.pow(2, attempts);
  return Math.min(delay, MAX_BACKOFF_MS);
}

export class MutationQueue {
  private readonly db: QueueDatabase;
  private ready: Promise<void> | null = null;

  constructor(db: QueueDatabase) {
    this.db = db;
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.db.execAsync(CREATE_TABLE_SQL);
    await this.ready;
  }

  async enqueue(method: QueuedMethod, path: string, body: unknown): Promise<QueuedMutation> {
    await this.ensureReady();
    const mutation: QueuedMutation = {
      id: Crypto.randomUUID(),
      method,
      path,
      body,
      idempotencyKey: Crypto.randomUUID(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      lastError: null,
    };

    await this.db.runAsync(
      `INSERT INTO mutation_queue
        (id, method, path, body, idempotency_key, attempts, next_attempt_at, created_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutation.id,
        mutation.method,
        mutation.path,
        JSON.stringify(mutation.body),
        mutation.idempotencyKey,
        mutation.attempts,
        mutation.nextAttemptAt,
        mutation.createdAt,
        mutation.lastError,
      ],
    );

    return mutation;
  }

  async pending(): Promise<QueuedMutation[]> {
    await this.ensureReady();
    const rows = await this.db.getAllAsync<QueueRow>(
      "SELECT * FROM mutation_queue ORDER BY created_at ASC",
    );
    return rows.map(rowToMutation);
  }

  private async remove(id: string): Promise<void> {
    await this.db.runAsync("DELETE FROM mutation_queue WHERE id = ?", [id]);
  }

  private async reschedule(mutation: QueuedMutation, error: unknown): Promise<void> {
    const attempts = mutation.attempts + 1;
    const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
    const message = error instanceof Error ? error.message : "unknown error";
    await this.db.runAsync(
      "UPDATE mutation_queue SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?",
      [attempts, nextAttemptAt, message, mutation.id],
    );
  }

  /**
   * Attempts every due mutation in order. `onlineCheck` guards the whole run:
   * a device with no connectivity should not burn through attempts (each
   * failure still pushes the backoff clock forward).
   */
  async flush(onlineCheck: () => Promise<boolean>): Promise<{ sent: number; failed: number }> {
    await this.ensureReady();

    const online = await onlineCheck();
    if (!online) return { sent: 0, failed: 0 };

    const due = (await this.pending()).filter((mutation) => mutation.nextAttemptAt <= Date.now());

    let sent = 0;
    let failed = 0;

    for (const mutation of due) {
      try {
        await rawMutate(mutation.method, mutation.path, mutation.body, mutation.idempotencyKey);
        await this.remove(mutation.id);
        sent += 1;
      } catch (error) {
        await this.reschedule(mutation, error);
        failed += 1;
      }
    }

    return { sent, failed };
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    await this.db.execAsync("DELETE FROM mutation_queue;");
  }
}

/** expo-sqlite's real methods want fixed-arity bind params, not an optional
 * array; this adapts them to the narrower shape this module and its tests
 * use everywhere else. */
function toQueueDatabase(db: SQLite.SQLiteDatabase): QueueDatabase {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params as SQLite.SQLiteBindParams),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindParams),
  };
}

let sharedQueue: MutationQueue | null = null;

/** Lazily opens the on-device SQLite database. Call once from app bootstrap
 * (or let the first enqueue/flush call do it) -- do not call in tests, build
 * a MutationQueue with a fake QueueDatabase instead. */
export function getOfflineQueue(): MutationQueue {
  sharedQueue ??= new MutationQueue(toQueueDatabase(SQLite.openDatabaseSync(DB_NAME)));
  return sharedQueue;
}
