// @newsekolah/config/prettier
// Re-exports the repository-root Prettier config so every package (and any
// editor integration resolving from a package instead of the root) formats
// identically. Kept in sync with /.prettierrc by hand; both are tiny.
module.exports = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
};
