// Lists API operations that no web screen calls, so a capability that only
// exists in the backend cannot quietly stay unreachable. Reads the bundled
// OpenAPI spec and greps apps/web for each operation's path.
//
// Usage: node scripts/api-coverage.mjs [--json]
//
// Matching is deliberately loose: the web builds most URLs with template
// literals, so an operation counts as reached when the static part of its
// path before the first "{" appears anywhere in apps/web. That direction of
// error is the safe one -- it under-reports gaps rather than inventing them.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Operations no screen is expected to call: server-to-server, transport-level,
// or owned by the mobile app rather than the web one.
const NOT_FOR_WEB = [
  "/health",
  "/ws/", // upgraded by hand, never through the generated client
  "/v1/whatsapp/webhook", // called by Meta, not by us
  "/v1/classroom-entry/scan", // the student scans this in the mobile app
];

function readSpecOperations() {
  const spec = readFileSync(join(root, "openapi/openapi.yaml"), "utf8");
  const operations = [];
  let path = null;
  for (const line of spec.split("\n")) {
    const pathLine = /^ {2}(\/\S+):\s*$/.exec(line);
    if (pathLine) {
      path = pathLine[1];
      continue;
    }
    const methodLine = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (methodLine && path) operations.push({ method: methodLine[1].toUpperCase(), path });
  }
  return operations;
}

// Callers live in apps/web and in the shared hooks under packages/api-client.
// The generated schema is skipped on purpose: it names every path in the spec,
// so counting it would mark every operation as reached.
const CALLER_ROOTS = ["apps/web", "packages/api-client/src"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "gen"]);

function readSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) readSources(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(readFileSync(full, "utf8"));
  }
  return out;
}

const operations = readSpecOperations();
const web = CALLER_ROOTS.flatMap((dir) => readSources(join(root, dir))).join("\n");

const missing = operations.filter(({ path }) => {
  if (NOT_FOR_WEB.some((prefix) => path.startsWith(prefix))) return false;
  const stem = path.split("{")[0].replace(/\/$/, "");
  if (stem === "" || web.includes(stem)) return false;
  // A caller may interpolate the last segment too, as in
  // `/v1/academic/enrollments/import/${step}`. Only accept that when the
  // interpolation sits exactly where this operation's last segment does, so
  // one sibling path cannot vouch for another.
  const parent = stem.slice(0, stem.lastIndexOf("/"));
  return !(parent !== "" && web.includes(`${parent}/\${`));
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: operations.length, missing }, null, 2));
} else {
  const reached = operations.length - missing.length;
  console.log(`operations: ${operations.length}, called by the web app: ${reached}`);
  if (missing.length === 0) {
    console.log("every operation has a caller");
  } else {
    console.log(`\nno web caller (${missing.length}):`);
    for (const { method, path } of missing) console.log(`  ${method} ${path}`);
  }
}

process.exit(missing.length > 0 ? 1 : 0);
