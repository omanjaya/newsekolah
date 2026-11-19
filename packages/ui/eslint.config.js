import { baseNoRestrictedSyntax } from "@newsekolah/config/eslint/base";
import { designSystemPlugin } from "@newsekolah/config/eslint/design-system";
import { fontSizeRestrictions } from "@newsekolah/config/eslint/design-system-patterns";
import react, { reactNoRestrictedSyntax } from "@newsekolah/config/eslint/react";

export default [
  ...react,
  // Literal font sizes are banned here: every component uses a typography
  // role. apps/web gets the same rule once its own codemod lands.
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...baseNoRestrictedSyntax, ...fontSizeRestrictions],
    },
  },
  {
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...reactNoRestrictedSyntax, ...fontSizeRestrictions],
    },
  },
  // The shared pickers replace native date, time, month and number inputs
  // here too, so a component never shows the browser's own control in
  // place of the page's language (apps/web has the same rule).
  {
    files: ["**/*.tsx"],
    plugins: { "design-system": designSystemPlugin },
    rules: {
      "design-system/no-native-pickers": "error",
    },
  },
  {
    files: ["**/*.stories.tsx"],
    rules: {
      "import/no-default-export": "off",
      "max-lines": "off",
    },
  },
];
