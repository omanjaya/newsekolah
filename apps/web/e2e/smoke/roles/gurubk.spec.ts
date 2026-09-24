import { forRole, registerCommonFlow } from "../fixtures";

/**
 * Guru BK (counseling teacher) shares "guru"'s teacher-role permissions
 * plus a counselor duty grant (manage_counseling), but has no teaching
 * assignment or timetable in the seed data. Its coverage is the shared
 * per-role flow only (dashboard, a short tour of pages it can actually
 * open, logout) -- the deep flows in guru.spec.ts (schedule, attendance
 * roster, journal, gradebook) all assume a real assignment gurubk doesn't
 * have.
 */
const binding = forRole("gurubk");
registerCommonFlow(binding, "gurubk", ["/schedule", "/attendance", "/discipline/counseling"]);
