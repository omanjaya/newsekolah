import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { changePassword, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { t } from "@/i18n/t";

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePassword(): React.JSX.Element {
  const { refreshMe } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && !submitting;

  async function handleSubmit(): Promise<void> {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
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
      <ScreenHeader title={t("change_password.title")} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-ink/70 dark:text-ink-dark/70">
          {t("change_password.description")}
        </Text>
        <Input
          label={t("change_password.current_label")}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          textContentType="password"
        />
        <Input
          label={t("change_password.new_label")}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        {errorMessage ? <Text className="text-sm text-status-absent">{errorMessage}</Text> : null}
        <Button
          label={t("change_password.submit")}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={submitting}
          fullWidth
        />
      </ScrollView>
    </View>
  );
}
