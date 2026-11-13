import { useUiLabels, type UiLabels } from "@newsekolah/ui";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import "../messages/features";
import { getMessages } from "../lib/i18n/get-messages";

import { useAppUiLabels } from "./ui-locale-provider";

function wrapperFor(locale: "id" | "en") {
  const messages = getMessages(locale);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={messages as never}
        onError={(error) => {
          throw error;
        }}
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

function labelsIn(locale: "id" | "en"): UiLabels {
  return renderHook(() => useAppUiLabels(), { wrapper: wrapperFor(locale) }).result.current;
}

/** The package's own Indonesian defaults: `useUiLabels()` with no provider. */
function packageDefaults(): UiLabels {
  return renderHook(() => useUiLabels()).result.current;
}

/** A label as text: a string as is, a function called with sample numbers. */
function asText(label: unknown): string {
  if (typeof label !== "function") return String(label);
  const call = label as (...args: number[]) => unknown;
  return String(call(3, 7, 12));
}

/**
 * English words that are the same as the Indonesian default, checked by
 * hand: "Normal" is the density name in both languages.
 */
const SAME_IN_BOTH = new Set<keyof UiLabels>(["tableDensityNormal"]);

describe("UiLocaleProvider", () => {
  it("fills every UiLabels key, so none keeps its Indonesian default in English", () => {
    const provided = Object.keys(labelsIn("en")).sort();
    expect(provided).toEqual(Object.keys(packageDefaults()).sort());
  });

  it("resolves every label from both catalogs without a missing message", () => {
    for (const locale of ["id", "en"] as const) {
      const labels = labelsIn(locale);
      for (const [key, label] of Object.entries(labels)) {
        expect(asText(label), `${locale} ${key}`).not.toMatch(/^app\.|^common\./);
      }
    }
  });

  it("speaks English in the English locale", () => {
    const english = labelsIn("en");
    const defaults = packageDefaults();
    const untranslated = (Object.keys(defaults) as (keyof UiLabels)[]).filter(
      (key) => !SAME_IN_BOTH.has(key) && asText(english[key]) === asText(defaults[key]),
    );
    expect(untranslated).toEqual([]);
    expect(english.toastClose).toBe("Close notification");
    expect(english.commandPaletteHintMove).toBe("Move");
    expect(english.avatarGroupMore(1)).toBe("1 more person");
  });
});
