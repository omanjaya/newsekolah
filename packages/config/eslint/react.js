// @newsekolah/config/eslint/react
// Adds React 19, react-hooks, and jsx-a11y rules on top of the base config.
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

import { base, baseNoRestrictedSyntax } from "./base.js";
import { EMOJI_SOURCE } from "./emoji-pattern.js";

/** The base list plus JSX text, for .jsx/.tsx files; see baseNoRestrictedSyntax. */
export const reactNoRestrictedSyntax = [
  ...baseNoRestrictedSyntax,
  {
    selector: `JSXText[value=/${EMOJI_SOURCE}/u]`,
    message: "Emoji is not allowed in JSX text. Use a Lucide icon instead.",
  },
];

/** @type {import("eslint").Linter.Config[]} */
export const react = [
  ...base,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- eslint-plugin-jsx-a11y ships no types
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...reactNoRestrictedSyntax],
      "react-hooks/exhaustive-deps": "error",
      "jsx-a11y/no-autofocus": "warn",
    },
  },
  // Next.js renders the app with its own bundled React canary, which lacks
  // some hooks that the installed react package (and so vitest) has. A hook
  // that only exists in the installed package passes every test and then
  // crashes in the browser.
  {
    files: ["**/*.{ts,tsx,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffectEvent"],
              message:
                "Next.js's bundled React has no useEffectEvent. Keep the latest callback in a ref instead.",
            },
          ],
        },
      ],
    },
  },
];

export default react;
