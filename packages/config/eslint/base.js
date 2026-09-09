// @newsekolah/config/eslint/base
// Shared ESLint 9 flat config for plain TypeScript packages (no React/JSX).
// React-specific rules live in ./react.js, Next.js additions in ./next.js.
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

import { EMOJI_SOURCE } from "./emoji-pattern.js";

const emojiRestrictions = [
  {
    selector: `Literal[value=/${EMOJI_SOURCE}/u]`,
    message: "Emoji is not allowed in code, comments, or UI text. Use a Lucide icon instead.",
  },
  {
    selector: `TemplateElement[value.raw=/${EMOJI_SOURCE}/u]`,
    message: "Emoji is not allowed in code, comments, or UI text. Use a Lucide icon instead.",
  },
];

export const emojiNoRestrictedSyntax = emojiRestrictions;

/** @type {import("eslint").Linter.Config[]} */
export const base = [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/storybook-static/**",
      "**/*.gen.ts",
      "**/gen/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "no-restricted-syntax": ["error", ...emojiRestrictions],
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-default-export": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.config.{js,ts,mjs,cjs}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "import/no-default-export": "off",
      "max-lines": "off",
    },
  },
];

export default base;
