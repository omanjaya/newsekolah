import { baseNoRestrictedSyntax } from "@newsekolah/config/eslint/base";
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
  {
    files: ["**/*.stories.tsx"],
    rules: {
      "import/no-default-export": "off",
      "max-lines": "off",
    },
  },
];
