import base from "./eslint/base.js";

// These config files are plain Node scripts, not TypeScript, so
// typescript-eslint's typed configs (scoped to .ts/.tsx) don't parse them
// and ESLint's default parser has no notion of Node's ambient globals.
export default [
  ...base,
  {
    files: ["eslint/**/*.js"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },
];
