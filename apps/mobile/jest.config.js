/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  collectCoverageFrom: ["src/lib/**/*.{ts,tsx}"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
  // jest-expo's own preset (jest-preset.js) already overrides
  // transformIgnorePatterns with the list below (including ".pnpm", needed
  // so pnpm's nested node_modules/.pnpm/<pkg>/node_modules/<pkg> layout gets
  // transformed at all) -- copied here verbatim plus one addition:
  // @newsekolah/i18n (a workspace package, resolved outside node_modules by
  // pnpm's symlink, so unaffected by this list itself) depends on
  // intl-messageformat, which ships ESM-only with no CommonJS build, as do
  // its own dependencies (@formatjs/fast-memoize,
  // @formatjs/icu-messageformat-parser). Without transforming those,
  // requiring @newsekolah/i18n under Jest's CJS runner throws "Must use
  // import to load ES Module".
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|intl-messageformat|@formatjs))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
