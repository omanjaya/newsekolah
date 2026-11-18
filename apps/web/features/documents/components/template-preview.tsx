"use client";

import { Badge, EmptyState, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { placeholderToken } from "../template-syntax";

export interface TemplatePreviewProps {
  /** The body as a preview (`renderPreviewHtml`); empty while there is no body. */
  html: string;
  /** Top-level values the body reads. */
  placeholders: readonly string[];
  /** Values written without their dot, which the API cannot read. */
  legacy: readonly string[];
  /** Whether the API fills `placeholder` in for this template's kind. */
  isKnown: (placeholder: string) => boolean;
  /** A value's name for a person. */
  label: (placeholder: string) => string;
}

/**
 * The preview of a document template, drawn in a sandboxed frame so the
 * body's markup cannot reach the page, and the values it uses: green for
 * one the API fills in, amber for one it does not know, red for one
 * written without its dot.
 */
export function TemplatePreview({
  html,
  placeholders,
  legacy,
  isKnown,
  label,
}: TemplatePreviewProps): ReactElement {
  const t = useTranslations("app.documents.templates.editor");
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-surface-sunken p-3">
        {html.trim() ? (
          <iframe
            title={t("previewLabel")}
            sandbox=""
            srcDoc={html}
            className="aspect-[1/1.2] w-full rounded-xs bg-surface shadow-1"
          />
        ) : (
          <EmptyState
            variant="compact"
            icon={<domainIcons.document aria-hidden="true" />}
            title={t("previewEmpty")}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-label text-fg">{t("placeholdersLabel")}</p>
        {placeholders.length === 0 && legacy.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("noPlaceholders")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((placeholder) => (
              <Badge
                key={placeholder}
                size="sm"
                tone={isKnown(placeholder) ? "success" : "warning"}
                title={placeholderToken(placeholder)}
              >
                {isKnown(placeholder)
                  ? label(placeholder)
                  : t("unknownBadge", { name: label(placeholder) })}
              </Badge>
            ))}
            {legacy.map((placeholder) => (
              <Badge
                key={`legacy-${placeholder}`}
                size="sm"
                tone="danger"
                title={`{{${placeholder}}}`}
              >
                {t("legacyBadge", { name: label(placeholder) })}
              </Badge>
            ))}
          </div>
        )}
        {placeholders.some((placeholder) => !isKnown(placeholder)) && (
          <p className="text-body-sm text-fg-muted">{t("unknownPlaceholdersHint")}</p>
        )}
      </div>
    </div>
  );
}
