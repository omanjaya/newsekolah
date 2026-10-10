"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApiClient } from "../../lib/api/client";

import type { DirectoryUser } from "./api";

/** A name stays valid this long; people are renamed rarely within a session. */
const DIRECTORY_NAME_STALE_MS = 5 * 60 * 1000;

/**
 * Ids per request. The API accepts 200, but ids travel in the query string:
 * 100 uuids stay near 4 KB, well below the 8 KB request-line limit common
 * proxies enforce, so a full chunk never fails on URL length.
 */
export const DIRECTORY_NAMES_CHUNK_SIZE = 100;

/** Wait this long so ids requested by several components share one request. */
const BATCH_WINDOW_MS = 10;

type ApiClient = ReturnType<typeof useApiClient>;

interface Waiter {
  resolve: (user: DirectoryUser | null) => void;
  reject: (error: unknown) => void;
}

/** Collects single-id loads for a moment, then fetches them in chunks. */
class DirectoryNameLoader {
  private readonly pending = new Map<string, Waiter[]>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly client: ApiClient) {}

  load(id: string): Promise<DirectoryUser | null> {
    return new Promise((resolve, reject) => {
      const waiters = this.pending.get(id);
      if (waiters) waiters.push({ resolve, reject });
      else this.pending.set(id, [{ resolve, reject }]);
      this.timer ??= setTimeout(() => {
        this.flush();
      }, BATCH_WINDOW_MS);
    });
  }

  private flush(): void {
    this.timer = undefined;
    const batch = [...this.pending.entries()];
    this.pending.clear();
    for (let start = 0; start < batch.length; start += DIRECTORY_NAMES_CHUNK_SIZE) {
      void this.fetchChunk(batch.slice(start, start + DIRECTORY_NAMES_CHUNK_SIZE));
    }
  }

  private async fetchChunk(chunk: [string, Waiter[]][]): Promise<void> {
    try {
      const response = await this.client.GET("/v1/directory/users", {
        params: { query: { ids: chunk.map(([id]) => id) } },
        // The API reads ids as one comma-separated parameter.
        querySerializer: { array: { style: "form", explode: false } },
      });
      const byId = new Map(response.data.map((user) => [user.id, user]));
      for (const [id, waiters] of chunk) {
        // An id the school does not know is cached as null: that is the
        // only case where a screen should show "unknown".
        for (const waiter of waiters) waiter.resolve(byId.get(id) ?? null);
      }
    } catch (error) {
      for (const [, waiters] of chunk) {
        for (const waiter of waiters) waiter.reject(error);
      }
    }
  }
}

// One loader per API client, so every component on the page shares a batch.
const loaders = new WeakMap<object, DirectoryNameLoader>();

function loaderFor(client: ApiClient): DirectoryNameLoader {
  let loader = loaders.get(client);
  if (!loader) {
    loader = new DirectoryNameLoader(client);
    loaders.set(client, loader);
  }
  return loader;
}

function combineNames(results: { data: DirectoryUser | null | undefined }[]): {
  names: Map<string, DirectoryUser>;
} {
  const names = new Map<string, DirectoryUser>();
  for (const result of results) {
    if (result.data) names.set(result.data.id, result.data);
  }
  return { names };
}

/**
 * Resolves the people whose ids are on screen to names, without loading the
 * directory. Ids are deduplicated, requested together in chunks, and cached
 * one by one in React Query, so another screen asking for some of the same
 * people reuses them and only fetches the rest. Returns id to person; an id
 * is absent while loading and when the school has no such person.
 */
export function useDirectoryNames(
  ids: readonly (string | null | undefined)[],
  enabled = true,
): Map<string, DirectoryUser> {
  const client = useApiClient();
  // Callers build `ids` fresh every render; key the query list by content.
  const idsKey = [
    ...new Set(ids.filter((id): id is string => id !== undefined && id !== null && id !== "")),
  ]
    .sort()
    .join(",");
  const unique = useMemo(() => (idsKey === "" ? [] : idsKey.split(",")), [idsKey]);

  const { names } = useQueries({
    queries: unique.map((id) => ({
      queryKey: queryKeys.directoryName(id),
      queryFn: () => loaderFor(client).load(id),
      enabled,
      staleTime: DIRECTORY_NAME_STALE_MS,
    })),
    combine: combineNames,
  });
  return names;
}

/** One person by id; `undefined` while loading or when unknown. */
export function useDirectoryName(id: string | null | undefined): DirectoryUser | undefined {
  const ids = useMemo(() => [id], [id]);
  return useDirectoryNames(ids).get(id ?? "");
}
