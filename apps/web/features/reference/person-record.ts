import { isNotFoundError } from "../../lib/api/not-found";

import type { NamesResult } from "./directory-names";

/**
 * Where the person behind a detail route stands: still `pending`, `found`,
 * `missing` (the school has no one with this id, or the id is not an id
 * at all), or `failed` (the lookup itself failed and may succeed on retry).
 */
export type PersonRecordStatus = "pending" | "found" | "missing" | "failed";

/**
 * Reads one id's directory lookup (`useDirectoryLookup([id])`) as the
 * status of the screen keyed by it, so a student page tells a wrong link
 * ("Siswa tidak ditemukan") from an outage ("Coba lagi"). The directory
 * answers every id of the school, deactivated people included, so an id it
 * does not know is not a person here; a malformed id is refused with the
 * INVALID_FORMAT 400 that `isNotFoundError` reads as not found.
 */
export function personRecordStatus(
  lookup: Pick<NamesResult, "names" | "isSuccess" | "isError" | "error">,
  id: string,
): PersonRecordStatus {
  if (lookup.names.has(id)) return "found";
  if (lookup.isSuccess) return "missing";
  if (lookup.isError) return isNotFoundError(lookup.error) ? "missing" : "failed";
  return "pending";
}
