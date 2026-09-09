// SQLite-backed queue for mutations made while offline (teacher attendance
// today; library scan opname will reuse it once that module lands -- see
// docs/10-mobile-strategy.md section 3). Each mutation keeps one
// Idempotency-Key for its whole lifetime so a retry after a flaky network
// never double-applies on the server. The retry/backoff policy here is
// mobile-only; @newsekolah/api-client has no offline queue of its own, this
// just sends queued mutations through its client via rawMutate (see
// lib/api/client.ts).
//
// A mutation can end in one of two terminal states once it stops being
// retried automatically: sent (removed from the table) or conflict (the
// server rejected it with 409 because someone else changed the same record
// while this device was offline -- retrying the same body would never
// succeed, so it is parked for a person to resolve instead of burning
// through backoff forever). See sync.ts for the app-wide flush loop and
// src/app/offline/conflicts.tsx for how a conflict gets resolved.

import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { ApiError } from "@newsekolah/api-client";
import { rawMutate } from "@/lib/api/client";

const DB_NAME = "newsekolah-offline.db";
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 2000;

export type QueuedMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type QueuedMutationStatus = "pending" | "conflict";

export interface QueuedMutation {
  id: string;
  method: QueuedMethod;
  path: string;
  body: unknown;
  idempotencyKey: string;
  status: QueuedMutationStatus;
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
  status: string | null;
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
    status TEXT NOT NULL DEFAULT 'pending',
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
    status: (row.status as QueuedMutationStatus | null) ?? "pending",
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

/** A 409 means the request reached the server and the server has its own
 * say on the record already (e.g. someone else submitted the same
 * attendance session first) -- retrying the identical body can never
 * resolve that, unlike a timeout or a 5xx. */
function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export interface FlushResult {
  sent: number;
  failed: number;
  conflicted: number;
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
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      lastError: null,
    };

    await this.db.runAsync(
      `INSERT INTO mutation_queue
        (id, method, path, body, idempotency_key, status, attempts, next_attempt_at, created_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutation.id,
        mutation.method,
        mutation.path,
        JSON.stringify(mutation.body),
        mutation.idempotencyKey,
        mutation.status,
        mutation.attempts,
        mutation.nextAttemptAt,
        mutation.createdAt,
        mutation.lastError,
      ],
    );

    return mutation;
  }

  /** Same as enqueue, but first drops any still-pending mutation already
   * queued for this exact method+path (e.g. the same attendance session
   * saved twice while offline) so repeated saves collapse to the latest
   * attempt instead of queuing every one of them. */
  async enqueueOrReplace(
    method: QueuedMethod,
    path: string,
    body: unknown,
  ): Promise<QueuedMutation> {
    await this.ensureReady();
    const duplicate = (await this.pending()).find((m) => m.method === method && m.path === path);
    if (duplicate) await this.remove(duplicate.id);
    return this.enqueue(method, path, body);
  }

  /** Mutations still waiting for a network attempt (excludes conflicts,
   * which need a person, not a retry). This is what a "N belum tersinkron"
   * badge should count. */
  async pending(): Promise<QueuedMutation[]> {
    await this.ensureReady();
    const rows = await this.db.getAllAsync<QueueRow>(
      "SELECT * FROM mutation_queue WHERE status = 'pending' ORDER BY created_at ASC",
    );
    return rows.map(rowToMutation);
  }

  /** Mutations the server rejected as a conflict, waiting for a person to
   * discard the local change or redo it as a correction. */
  async conflicts(): Promise<QueuedMutation[]> {
    await this.ensureReady();
    const rows = await this.db.getAllAsync<QueueRow>(
      "SELECT * FROM mutation_queue WHERE status = 'conflict' ORDER BY created_at ASC",
    );
    return rows.map(rowToMutation);
  }

  async remove(id: string): Promise<void> {
    await this.ensureReady();
    await this.db.runAsync("DELETE FROM mutation_queue WHERE id = ?", [id]);
  }

  private async reschedule(mutation: QueuedMutation, error: unknown): Promise<void> {
    const attempts = mutation.attempts + 1;
    const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
    await this.db.runAsync(
      "UPDATE mutation_queue SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?",
      [attempts, nextAttemptAt, errorMessage(error), mutation.id],
    );
  }

  private async markConflict(mutation: QueuedMutation, error: unknown): Promise<void> {
    await this.db.runAsync(
      "UPDATE mutation_queue SET status = 'conflict', last_error = ? WHERE id = ?",
      [errorMessage(error), mutation.id],
    );
  }

  /**
   * A person's call on a conflicted mutation: "discard" drops the local
   * change entirely (the server's own record wins); "retry" resets it back
   * to pending so the same body is attempted again immediately -- only
   * useful when the person has confirmed the underlying clash cleared. */
  async resolveConflict(id: string, resolution: "discard" | "retry"): Promise<void> {
    await this.ensureReady();
    if (resolution === "discard") {
      await this.remove(id);
      return;
    }
    await this.db.runAsync(
      "UPDATE mutation_queue SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL WHERE id = ?",
      [Date.now(), id],
    );
  }

  /**
   * Attempts every due, still-pending mutation in order. `onlineCheck`
   * guards the whole run: a device with no connectivity should not burn
   * through attempts (each failure still pushes the backoff clock forward).
   */
  async flush(onlineCheck: () => Promise<boolean>): Promise<FlushResult> {
    await this.ensureReady();

    const online = await onlineCheck();
    if (!online) return { sent: 0, failed: 0, conflicted: 0 };

    const due = (await this.pending()).filter((mutation) => mutation.nextAttemptAt <= Date.now());

    let sent = 0;
    let failed = 0;
    let conflicted = 0;

    for (const mutation of due) {
      try {
        await rawMutate(mutation.method, mutation.path, mutation.body, mutation.idempotencyKey);
        await this.remove(mutation.id);
        sent += 1;
      } catch (error) {
        if (isConflict(error)) {
          await this.markConflict(mutation, error);
          conflicted += 1;
        } else {
          await this.reschedule(mutation, error);
          failed += 1;
        }
      }
    }

    return { sent, failed, conflicted };
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
