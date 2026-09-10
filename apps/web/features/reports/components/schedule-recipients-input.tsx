"use client";

import { Badge, Button, IconButton, Input } from "@newsekolah/ui";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 10;

/**
 * A small chip list rather than a plain comma-separated field: the
 * schedule can have up to 10 recipients, and the server rejects an
 * address that is not a user of this tenant, so surfacing each one as a
 * removable chip makes it obvious which addresses will actually be sent.
 */
export function ScheduleRecipientsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}): ReactElement {
  const t = useTranslations("app.reports.schedules.form");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function addDraft() {
    const email = draft.trim();
    if (email === "") return;
    if (!EMAIL_PATTERN.test(email)) {
      setError(t("recipientInvalid"));
      return;
    }
    if (value.includes(email)) {
      setError(t("recipientDuplicate"));
      return;
    }
    if (value.length >= MAX_RECIPIENTS) {
      setError(t("recipientLimit"));
      return;
    }
    onChange([...value, email]);
    setDraft("");
    setError("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((email) => (
          <Badge key={email} variant="neutral" className="flex items-center gap-1 pr-1">
            {email}
            <IconButton
              icon={<X />}
              className="[&>svg]:size-3.5"
              aria-label={t("removeRecipient", { email })}
              onClick={() => {
                onChange(value.filter((v) => v !== email));
              }}
            />
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder={t("recipientPlaceholder")}
          disabled={value.length >= MAX_RECIPIENTS}
          className="max-w-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={value.length >= MAX_RECIPIENTS}
          onClick={addDraft}
        >
          {t("addRecipient")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}
