import react from "@newsekolah/config/eslint/react";

export default [
  ...react,
  {
    files: ["**/*.stories.tsx"],
    rules: {
      "import/no-default-export": "off",
      "max-lines": "off",
    },
  },
];
