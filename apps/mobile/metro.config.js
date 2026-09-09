const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo resolution: workspace packages (@newsekolah/api-client, schemas,
// i18n, ui-tokens, ...) live under <root>/packages, symlinked into
// node_modules by pnpm. Metro only watches/resolves within its project root
// by default, so it needs the workspace root added to both watchFolders (to
// see source changes there) and nodeModulesPaths (to resolve dependencies
// hoisted to the workspace root's node_modules instead of this app's own).
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// The workspace packages above are consumed via package.json "exports"
// (including subpaths like "@newsekolah/api-client/react" and
// "@newsekolah/i18n/messages/id.json"); Metro must read that field to
// resolve them instead of falling back to "main".
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: "./src/global.css" });
