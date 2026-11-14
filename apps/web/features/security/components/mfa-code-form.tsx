"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { Button, DialogFooter, Field, Form, FormError, FormField, Input } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { mfaCodeSchema, type MfaCodeInput } from "../schema";

/**
 * The single-field "enter a code" form reused by enrolment confirmation,
 * disabling, and recovery-code regeneration, ending in the dialog's footer
 * (Batal, then the action). Error mapping mirrors `login-form.tsx`: an
 * `ApiError` sets a root-level message instead of a field error, since a
 * wrong code is not a shape problem the field validator would catch.
 */
export function MfaCodeForm({
  codeLabel,
  submitLabel,
  destructive,
  onSubmit,
  onCancel,
  children,
}: {
  codeLabel: string;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
  /** Shown above the code field (the enrolment's QR code). */
  children?: ReactNode;
}): ReactElement {
  const locale = useLocale() as Locale;
  const t = useTranslations("app.security");
  const apiErrorMessage = useApiErrorMessage();

  const form = useForm<MfaCodeInput>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  async function handleSubmit(values: MfaCodeInput) {
    form.clearErrors("root");
    try {
      await onSubmit(values.code);
      form.reset();
    } catch (error) {
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      form.setError("root", { message });
    }
  }

  return (
    <Form
      form={form}
      translate={translateFormMessage(locale)}
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
    >
      {form.formState.errors.root?.message && (
        <FormError>{form.formState.errors.root.message}</FormError>
      )}
      {children}
      <FormField
        control={form.control}
        name="code"
        render={({ field }) => (
          <Field label={codeLabel}>
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              className="font-mono tracking-widest"
              {...field}
            />
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          variant={destructive ? "danger" : "primary"}
          loading={form.formState.isSubmitting}
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </Form>
  );
}
