/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  collectCoverageFrom: ["src/lib/**/*.{ts,tsx}"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
};
