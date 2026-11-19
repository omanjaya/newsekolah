import { isNotFoundError } from "../../lib/api/not-found";

import type { ProfileKind } from "./api";
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
 *
 * A route about one kind of person (a student's profile) passes that kind:
 * someone the school does have but of another kind (a staff member's or an
 * administrator's id in a student address) is `missing` there too, never a
 * student page built around a staff member's name.
 */
export function personRecordStatus(
  lookup: Pick<NamesResult, "names" | "isSuccess" | "isError" | "error">,
  id: string,
  kind?: ProfileKind,
): PersonRecordStatus {
  const person = lookup.names.get(id);
  if (person) return kind && person.profile_kind !== kind ? "missing" : "found";
  if (lookup.isSuccess) return "missing";
  if (lookup.isError) return isNotFoundError(lookup.error) ? "missing" : "failed";
  return "pending";
}
