/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  collectCoverageFrom: ["src/lib/**/*.{ts,tsx}"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
  // lucide-react-native's package.json points its "react-native" export
  // condition (the one Metro -- and this preset's resolver -- honors) at an
  // ESM-only .mjs file. Jest's own transform only covers .js/.jsx/.ts/.tsx
  // (see jest-expo's preset), so that file reaches jest-runtime untransformed
  // and require() rejects it as an ES module. The package also ships a
  // plain CommonJS build under the "require" condition; this mapping sends
  // Jest there instead. Metro (the real app) is unaffected -- it keeps
  // resolving the "react-native"/ESM entry as intended.
  moduleNameMapper: {
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
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
  // import to load ES Module". lucide-react-native (icons used throughout
  // the Hijau Segar components) ships the same way and needs the same
  // treatment -- added here rather than left to jest-expo's own list.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|intl-messageformat|@formatjs|lucide-react-native))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};
