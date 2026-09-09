"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@newsekolah/ui";
import { useLocale } from "next-intl";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { mfaCodeSchema, type MfaCodeInput } from "../schema";

/**
 * The single-field "enter a code" form reused by enrolment confirmation,
 * disabling, and recovery-code regeneration. Error mapping mirrors
 * `login-form.tsx`: an `ApiError` sets a root-level message instead of a
 * field error, since a wrong code is not a shape problem the field
 * validator would catch.
 */
export function MfaCodeForm({
  codeLabel,
  submitLabel,
  destructive,
  onSubmit,
}: {
  codeLabel: string;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (code: string) => Promise<void>;
}): ReactElement {
  const locale = useLocale() as Locale;
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
      className="flex flex-col gap-4"
    >
      {form.formState.errors.root?.message && (
        <Alert variant="warning" title={form.formState.errors.root.message} />
      )}
      <FormField
        control={form.control}
        name="code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{codeLabel}</FormLabel>
            <FormControl>
              <Input autoComplete="one-time-code" inputMode="numeric" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button
        type="submit"
        variant={destructive ? "danger" : "primary"}
        size="sm"
        loading={form.formState.isSubmitting}
        className="self-end"
      >
        {submitLabel}
      </Button>
    </Form>
  );
}
