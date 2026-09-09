import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getTenantBranding, ApiError } from "@/lib/api";
import { t } from "@/i18n/t";

export default function Login(): React.JSX.Element {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: branding } = useQuery({
    queryKey: ["tenant-branding"],
    queryFn: getTenantBranding,
  });

  async function handleSubmit(): Promise<void> {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
      router.replace("/");
    } catch (error) {
      if (error instanceof ApiError && error.code === "AUTH_INVALID_CREDENTIALS") {
        setErrorMessage(t("login.error_invalid_credentials"));
      } else {
        setErrorMessage(t("login.error_generic"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-bg dark:bg-bg-dark"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6 px-6 py-10">
          <View className="items-center gap-2">
            {branding?.logo_url ? (
              <Image
                source={{ uri: branding.logo_url }}
                className="h-16 w-16"
                resizeMode="contain"
              />
            ) : null}
            <Text className="text-xl font-medium text-ink dark:text-ink-dark">
              {branding?.name ?? t("login.title")}
            </Text>
          </View>

          <View className="gap-4">
            <Input
              label={t("login.username_label")}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
            />
            <Input
              label={t("login.password_label")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />
            {errorMessage ? (
              <Text className="text-sm text-status-absent">{errorMessage}</Text>
            ) : null}
            <Button
              label={t("login.submit")}
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              loading={submitting}
              fullWidth
            />
          </View>

          <Pressable
            accessibilityRole="link"
            className="min-h-11 items-center justify-center"
            onPress={() => router.push("/(auth)/server-setup")}
          >
            <Text className="text-sm text-accent">{t("login.server_link")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
