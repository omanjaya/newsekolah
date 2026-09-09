import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useChangePassword } from "@newsekolah/api-client/react";
import { ApiError } from "@newsekolah/api-client";
import { changePasswordSchema, toChangePasswordRequest } from "@newsekolah/schemas";
import type { MessageKey } from "@newsekolah/i18n";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getApiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { t, tShared } from "@/i18n/t";

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePassword(): React.JSX.Element {
  const { refreshMe } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const changePasswordMutation = useChangePassword(getApiClient());

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && !submitting;

  async function handleSubmit(): Promise<void> {
    setErrorMessage(null);

    // This screen collects no confirmation field, so it stands in for
    // itself here purely so @newsekolah/schemas can validate length/required
    // rules; the refine() check this always satisfies is confirm-password UX
    // a future screen redesign would add, not something this form skips.
    const validation = changePasswordSchema.safeParse({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: newPassword,
    });
    if (!validation.success) {
      const [firstIssue] = validation.error.issues;
      setErrorMessage(
        firstIssue ? tShared(firstIssue.message as MessageKey) : t("error.generic_action"),
      );
      return;
    }

    setSubmitting(true);
    try {
      await changePasswordMutation.mutateAsync(toChangePasswordRequest(validation.data));
      await refreshMe();
      router.replace("/");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : t("error.generic_action"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={tShared("auth.changePassword.title")} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-ink/70 dark:text-ink-dark/70">
          {t("change_password.description")}
        </Text>
        <Input
          label={tShared("auth.changePassword.currentLabel")}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          textContentType="password"
        />
        <Input
          label={tShared("auth.changePassword.newLabel")}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        {errorMessage ? <Text className="text-sm text-status-absent">{errorMessage}</Text> : null}
        <Button
          label={tShared("auth.changePassword.submit")}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </View>
  );
}
