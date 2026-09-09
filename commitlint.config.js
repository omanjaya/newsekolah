// Conventional Commits, English only (CLAUDE.md: "Bahasa kode dan commit: English").
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
  },
};
