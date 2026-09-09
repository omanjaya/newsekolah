// @newsekolah/config/eslint/next
// React config plus Next.js App Router conventions. `apps/web` owns the
// `@next/eslint-plugin-next` dependency itself; this file only adds rules
// that do not require the plugin instance, keeping this package Next-agnostic.
import { react } from "./react.js";

/** @type {import("eslint").Linter.Config[]} */
export const next = [
  ...react,
  {
    files: ["**/app/**/*.{ts,tsx}"],
    rules: {
      // Route segment files intentionally export page/layout/loading/error as default.
      "import/no-default-export": "off",
    },
  },
];

export default next;
