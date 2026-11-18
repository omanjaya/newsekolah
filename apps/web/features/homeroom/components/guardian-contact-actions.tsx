"use client";

import { IconButton } from "@newsekolah/ui";
import { MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { telHref, whatsAppHref } from "../lib/guardian-contact";

/** A call and a WhatsApp to a student's guardian, one tap each. */
export function GuardianContactActions({
  phone,
  studentName,
}: {
  phone: string;
  studentName: string;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const call = t("contactCall", { name: studentName });
  const whatsapp = t("contactWhatsapp", { name: studentName });
  return (
    <span className="flex items-center gap-1">
      <IconButton asChild icon={<Phone />} variant="ghost" aria-label={call}>
        <a href={telHref(phone)} aria-label={call} />
      </IconButton>
      <IconButton asChild icon={<MessageCircle />} variant="ghost" aria-label={whatsapp}>
        <a href={whatsAppHref(phone)} target="_blank" rel="noreferrer" aria-label={whatsapp} />
      </IconButton>
    </span>
  );
}
