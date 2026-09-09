"use client";

import { Button, Input } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * Manual entry for the token printed under every QR. The camera scanner
 * lives in the mobile app; on the web a student types or pastes the code.
 */
export function ScanTokenInput({
  label,
  onSubmit,
  pending,
}: {
  label: string;
  onSubmit: (raw: string) => void;
  pending: boolean;
}): ReactElement {
  const t = useTranslations("app.permits.scan");
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-2 md:flex-row md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value);
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-[13px]">
        <span className="font-medium">{label}</span>
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder={t("placeholder")}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <Button type="submit" loading={pending} disabled={!value.trim()}>
        {t("submit")}
      </Button>
    </form>
  );
}
