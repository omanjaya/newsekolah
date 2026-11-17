import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { designSystemPlugin, nativeDialogRules } from "./design-system-plugin.js";

function ruleIds(code: string, rules: Linter.RulesRecord): string[] {
  const linter = new Linter({ configType: "flat" });
  return linter
    .verify(
      code,
      [
        {
          files: ["**/*.tsx"],
          languageOptions: {
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { window: "readonly", globalThis: "readonly", self: "readonly" },
          },
          plugins: { "design-system": designSystemPlugin },
          rules,
        },
      ],
      "fixture.tsx",
    )
    .map((message) => message.ruleId ?? message.message);
}

const only = (rule: string) => ({ [`design-system/${rule}`]: "error" }) as Linter.RulesRecord;

describe("design-system plugin", () => {
  describe("no-literal-font-size", () => {
    it.each([
      'const a = <p className="text-[13px] text-fg" />;',
      "const a = `text-[1.5rem] ${b}`;",
      'const a = "text-[length:13px]";',
    ])("rejects %s", (code) => {
      expect(ruleIds(code, only("no-literal-font-size"))).toEqual([
        "design-system/no-literal-font-size",
      ]);
    });

    it.each([
      'const a = <p className="text-caption text-fg-muted" />;',
      'const a = "text-kiosk-display text-[var(--color-fg)]";',
    ])("allows %s", (code) => {
      expect(ruleIds(code, only("no-literal-font-size"))).toEqual([]);
    });
  });

  describe("no-panel-radius", () => {
    it.each([
      'const a = <div className="rounded-sm border border-border px-3 py-2" />;',
      'const a = "border rounded-xs p-2";',
      "const a = `flex rounded-sm border px-3 ${b}`;",
      'const a = "md:rounded-sm md:border bg-surface";',
    ])("rejects %s", (code) => {
      expect(ruleIds(code, only("no-panel-radius"))).toEqual(["design-system/no-panel-radius"]);
    });

    it.each([
      'const a = <div className="rounded-lg border border-border p-4" />;',
      'const a = "rounded-sm bg-state-hover px-2";',
      'const a = "border-b border-line rounded-full";',
      'const a = "rounded-sm border-border";',
    ])("allows %s", (code) => {
      expect(ruleIds(code, only("no-panel-radius"))).toEqual([]);
    });
  });

  describe("no-raw-elements", () => {
    it.each([
      "const a = <h2>Judul</h2>;",
      'const a = <button type="button">Simpan</button>;',
      "const a = <select />;",
      "const a = <textarea />;",
      "const a = <table />;",
      'const a = <label htmlFor="x">Nama</label>;',
    ])("rejects %s", (code) => {
      expect(ruleIds(code, only("no-raw-elements"))).toEqual(["design-system/no-raw-elements"]);
    });

    it.each([
      "const a = <Button>Simpan</Button>;",
      "const a = <SectionHeader title={t} />;",
      "const a = <thead><tr><th /></tr></thead>;",
      "const a = <ui.button />;",
    ])("allows %s", (code) => {
      expect(ruleIds(code, only("no-raw-elements"))).toEqual([]);
    });
  });

  describe("no-native-pickers", () => {
    it.each([
      'const a = <input type="date" />;',
      'const a = <Input type="number" />;',
      'const a = <input type={"datetime-local"} />;',
      'const a = <Input type="month" />;',
      'const a = <input type="time" />;',
    ])("rejects %s", (code) => {
      expect(ruleIds(code, only("no-native-pickers"))).toEqual(["design-system/no-native-pickers"]);
    });

    it.each([
      'const a = <input type="file" className="sr-only" />;',
      'const a = <Input type="email" />;',
      "const a = <Input type={kind} />;",
      'const a = <DatePicker type="date" />;',
    ])("allows %s", (code) => {
      expect(ruleIds(code, only("no-native-pickers"))).toEqual([]);
    });
  });

  describe("native dialogs", () => {
    it.each(['window.confirm("Hapus?");', 'alert("Tersimpan");', 'globalThis.prompt("Nama");'])(
      "rejects %s",
      (code) => {
        expect(ruleIds(code, nativeDialogRules)).toHaveLength(1);
      },
    );

    it("allows a local function that happens to be called confirm", () => {
      // The harness parses plain JavaScript, so the fixture carries no type annotation.
      const code = 'const confirm = (key) => key;\nconfirm("defaultConfirmLabel");';
      expect(ruleIds(code, nativeDialogRules)).toEqual([]);
    });
  });
});
