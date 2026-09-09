// ESLint 9 resolves its flat config from the working directory, not from the
// file being linted, and this repo keeps one config per workspace. So group
// the staged files by the workspace that owns them and run each workspace's
// own ESLint from that directory.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

function workspaceFor(file) {
  let dir = dirname(resolve(repoRoot, file));
  while (dir.startsWith(repoRoot) && dir !== repoRoot) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return null;
}

const byWorkspace = new Map();
for (const file of process.argv.slice(2)) {
  const workspace = workspaceFor(file);
  if (!workspace) continue;
  const files = byWorkspace.get(workspace) ?? [];
  files.push(relative(workspace, resolve(repoRoot, file)));
  byWorkspace.set(workspace, files);
}

let failed = false;
for (const [workspace, files] of byWorkspace) {
  const result = spawnSync("pnpm", ["exec", "eslint", ...files], {
    cwd: workspace,
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
