import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { ApiError } from "@newsekolah/api-client";
import { loginSchema } from "@newsekolah/schemas";
import type { MessageKey } from "@newsekolah/i18n";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getApiClient } from "@/lib/api/client";
import { getTenantSlug } from "@/lib/tenant/tenant-store";
import { t, tShared } from "@/i18n/t";

export default function Login(): React.JSX.Element {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const client = getApiClient();
  const { data: branding } = useTenantBranding(client, getTenantSlug() ?? undefined);

  async function handleSubmit(): Promise<void> {
    setErrorMessage(null);

    // client is fixed by platform, not user input, but loginSchema requires
    // it -- @newsekolah/schemas validates the request shape as a whole, not
    // just the fields this form collects.
    const validation = loginSchema.safeParse({
      username: username.trim(),
      password,
      client: Platform.OS === "ios" ? "ios" : "android",
    });
    if (!validation.success) {
      const [firstIssue] = validation.error.issues;
      setErrorMessage(
        firstIssue ? tShared(firstIssue.message as MessageKey) : t("login.error_generic"),
      );
      return;
    }

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
              {branding?.name ?? tShared("auth.login.title")}
            </Text>
          </View>

          <View className="gap-4">
            <Input
              label={tShared("auth.login.usernameLabel")}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
            />
            <Input
              label={tShared("auth.login.passwordLabel")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />
            {errorMessage ? (
              <Text className="text-sm text-status-absent">{errorMessage}</Text>
            ) : null}
            <Button
              label={tShared("auth.login.submit")}
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
