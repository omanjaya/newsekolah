import { queryKeys, type components, type NewsekolahApiClient } from "@newsekolah/api-client";
import { isTenantBrandingQuery } from "@newsekolah/api-client/react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { setAccessToken } from "../api/access-token";
import { suspendSimulation, syncSimulationIdentity } from "../simulation/clock";

type AuthTokens = components["schemas"]["AuthTokens"];

/** `me`, which the swap replaces, and the tenant's branding, which names the school. */
function keptAcrossTheSwap(queryKey: QueryKey): boolean {
  return (queryKey.length === 1 && queryKey[0] === "me") || isTenantBrandingQuery(queryKey);
}

/**
 * Hands this tab to the account an identity swap answered with: the start
 * of an impersonation, or a role-testing switch either way. Both happen
 * with the app's screens still mounted, so unlike a sign-in this keeps
 * `me` (replaced, never removed, so the session does not read as
 * anonymous for a moment) and the tenant's branding, and drops the rest:
 * no query key names the reader.
 *
 * - Cancels first. Removing a query cancels its fetch as well, but `me` is
 *   kept, and a `/v1/me` answer for the previous account still on its way
 *   would land over the seeded one.
 * - Pauses the simulated clock while the token changes hands, then
 *   resolves it for the new account, which may use only its initiating
 *   superadmin's saved clock (lib/simulation/clock.ts).
 * - Has the API client drop any refresh still on its way for the previous
 *   account (`forgetAccessToken`) right before the new token is set: one
 *   that lands later would otherwise store and announce the previous
 *   account's token over the new one, under the new `me`.
 * - Removing a query does not notify a component still showing it: that
 *   component keeps the previous account's data until it renders again,
 *   and only then reads afresh, as the new account. The new `me`
 *   re-renders everything that reads the session, and both callers
 *   navigate right after. `resetQueries` would notify every mounted
 *   screen at once, but it would also refetch, as the new account, every
 *   active query of the screen being left (a users list a teacher may not
 *   read) just before it unmounts.
 *
 * The caller removes the server access cookie (clearServerAccessCookie)
 * before the request that made the swap.
 */
export async function switchReader(
  queryClient: QueryClient,
  client: NewsekolahApiClient,
  tokens: AuthTokens,
): Promise<void> {
  await queryClient.cancelQueries();
  suspendSimulation();
  client.forgetAccessToken();
  setAccessToken(tokens.access_token);
  queryClient.removeQueries({ predicate: (query) => !keptAcrossTheSwap(query.queryKey) });
  queryClient.setQueryData(queryKeys.me(), tokens.user);
  syncSimulationIdentity(tokens.user);
}
