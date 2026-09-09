"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, ConfirmDialog, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type GradeLevelTemplate, useApplyGradeLevelTemplateMutation } from "../api";

const TEMPLATES: GradeLevelTemplate[] = ["sd", "smp", "sma", "smk"];

/**
 * Shown only while the "grade_levels" step is not done (SetupView decides
 * that); once grade levels exist the shortcut has nothing left to offer.
 */
export function GradeLevelTemplateAction(): ReactElement {
  const t = useTranslations("app.onboarding.template");
  const tLevels = useTranslations("app.onboarding.levels");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const apply = useApplyGradeLevelTemplateMutation();
  const [template, setTemplate] = useState<GradeLevelTemplate>("sd");
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    try {
      await apply.mutateAsync(template);
      toast.success(t("success"));
      setConfirming(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("body")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("templateLabel")}</span>
          <Select
            options={TEMPLATES.map((value) => ({ value, label: tLevels(value) }))}
            value={template}
            onValueChange={(value) => {
              setTemplate(value as GradeLevelTemplate);
            }}
            className="w-40"
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t("action")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody")}
        confirmLabel={t("confirm")}
        confirming={apply.isPending}
        onConfirm={confirm}
      />
    </section>
  );
}
