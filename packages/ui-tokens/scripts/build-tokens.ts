import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildCss, buildTs, buildTypeRolesCss, packageRoot } from "./generate.js";

const distDir = resolve(packageRoot, "dist");
mkdirSync(distDir, { recursive: true });
writeFileSync(resolve(distDir, "tokens.css"), buildCss());
writeFileSync(resolve(distDir, "type-roles.css"), buildTypeRolesCss());
writeFileSync(resolve(distDir, "tokens.ts"), buildTs());

// eslint-disable-next-line no-console
console.log("ui-tokens: wrote dist/tokens.css, dist/type-roles.css and dist/tokens.ts");
