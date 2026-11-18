import { compile } from "tailwindcss";
import { vi } from "vitest";

/**
 * The forms-and-data block at the end of styles.css, read as it ships and
 * compiled on its own with `classes`. The test environment loads CSS
 * imports as empty text, so the file is read from disk; the package has no
 * Node types, so the two calls it needs are typed here.
 */
export async function compiledFormsDataCss(classes: string[]): Promise<string> {
  const { readFileSync } = await vi.importActual<{
    readFileSync: (path: string, encoding: "utf8") => string;
  }>("node:fs");
  const { cwd } = await vi.importActual<{ cwd: () => string }>("node:process");
  // Vitest runs from the package root.
  const styles = readFileSync(`${cwd()}/src/styles.css`, "utf8");
  const block = styles.slice(styles.indexOf("Wave 2, stream 3: forms and data"));
  const compiler = await compile(`@tailwind utilities;\n/*${block}`);
  return compiler.build(classes);
}
