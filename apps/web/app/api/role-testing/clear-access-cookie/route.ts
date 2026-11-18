/**
 * The path the cookie route had before it moved to
 * /api/session/clear-access-cookie. A tab still running the previous
 * bundle during a deploy calls it before a role-testing switch; without
 * this the switch would fail until the tab reloads. Kept for one release:
 * remove it with the release after the one that moved the route.
 */
export { POST } from "../../session/clear-access-cookie/route";
