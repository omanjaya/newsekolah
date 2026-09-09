// ESLint 9 flat config. Kept local to apps/mobile (not @newsekolah/config yet):
// this app's rules (React Native/Expo file layout, no-emoji) do not match that
// package's web-oriented presets.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

const EMOJI_PATTERN =
  "[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{1F1E6}-\\u{1F1FF}\\u{2190}-\\u{21FF}\\u{2B00}-\\u{2BFF}]";

const NO_EMOJI_RULE = [
  "error",
  {
    selector: `Literal[value=/${EMOJI_PATTERN}/u]`,
    message: "No emoji in UI, code, or comments (see CLAUDE.md).",
  },
  {
    selector: `JSXText[value=/${EMOJI_PATTERN}/u]`,
    message: "No emoji in UI, code, or comments (see CLAUDE.md).",
  },
];

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "web-build/**",
      "ios/**",
      "android/**",
      "coverage/**",
    ],
  },

  // Type-checked strict rules for real app/test source only. Config and setup
  // scripts below are plain Node CommonJS and are handled separately.
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.{ts,tsx}", "__tests__/**/*.{ts,tsx}", "app.config.ts"],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.{ts,tsx}", "__tests__/**/*.{ts,tsx}", "app.config.ts"],
  })),
  {
    files: ["src/**/*.{ts,tsx}", "__tests__/**/*.{ts,tsx}", "app.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      // React/RN event handlers are idiomatically written as void-returning
      // arrow shorthand (`onPress={() => router.back()}`); that shape is not
      // the "confusing" case this rule targets.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "no-restricted-syntax": ["error", ...NO_EMOJI_RULE],
    },
  },
  prettierConfig,

  // Jest globals for test files.
  {
    files: ["__tests__/**/*.{ts,tsx}", "jest.setup.js"],
    languageOptions: {
      globals: {
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        globalThis: "readonly",
      },
    },
  },

  // Plain Node CommonJS config/setup scripts: no type-aware linting, no
  // React rules, just enough to keep them honest (still no emoji).
  {
    files: [
      "*.config.js",
      "*.config.mjs",
      "babel.config.js",
      "metro.config.js",
      "jest.setup.js",
    ],
    languageOptions: {
      globals: {
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
        process: "readonly",
        jest: "readonly",
        globalThis: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-restricted-syntax": ["error", ...NO_EMOJI_RULE],
    },
  },
);
