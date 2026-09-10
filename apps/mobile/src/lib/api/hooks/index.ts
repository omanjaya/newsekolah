// Query and mutation hooks for the mobile screens, split by area (see the
// sibling files in this directory) and re-exported here so every screen
// keeps importing from "@/lib/api/hooks" as one module. Keys mirror
// @newsekolah/api-client's queryKeys so an invalidation on one screen
// refreshes the others.
export * from "./types";
export * from "./reference";
export * from "./notifications";
export * from "./attendance";
export * from "./permits";
export * from "./family";
export * from "./staff";
export * from "./review";
export * from "./library";
