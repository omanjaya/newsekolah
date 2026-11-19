/**
 * Either permission opens the observed teacher's pages ("Supervisi saya"
 * and an observation's detail): view_supervision reads every teacher,
 * view_own_supervision (the teacher's default) only the caller's own. The
 * API enforces the same pair (openapi/modules/supervision.yaml) and scopes
 * the narrower one in the service, so the page never needs to.
 */
export const SUPERVISION_READ_PERMISSIONS: string[] = ["view_supervision", "view_own_supervision"];
