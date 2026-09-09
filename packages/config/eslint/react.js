// @newsekolah/config/eslint/react
// Adds React 19, react-hooks, and jsx-a11y rules on top of the base config.
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

import { base, emojiNoRestrictedSyntax } from "./base.js";
import { EMOJI_SOURCE } from "./emoji-pattern.js";

const jsxEmojiRestrictions = [
  ...emojiNoRestrictedSyntax,
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
      "no-restricted-syntax": ["error", ...jsxEmojiRestrictions],
      "react-hooks/exhaustive-deps": "error",
      "jsx-a11y/no-autofocus": "warn",
    },
  },
];

export default react;
