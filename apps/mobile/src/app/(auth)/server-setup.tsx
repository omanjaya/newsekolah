import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getBaseUrl, resetBaseUrlOverride, setBaseUrlOverride } from "@/lib/tenant/tenant-store";
import { showToast } from "@/components/ui/Toast";
import { t } from "@/i18n/t";

export default function ServerSetup(): React.JSX.Element {
  const [url, setUrl] = useState(getBaseUrl());

  async function save(): Promise<void> {
    await setBaseUrlOverride(url.trim());
    showToast(t("server_setup.save"), "success");
    router.back();
  }

  async function reset(): Promise<void> {
    await resetBaseUrlOverride();
    setUrl(getBaseUrl());
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("server_setup.title")} showBack />
      <View className="gap-4 px-4 pt-4">
        <Input
          label={t("server_setup.url_label")}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Button label={t("server_setup.save")} onPress={() => void save()} fullWidth />
        <Button
          label={t("server_setup.reset")}
          onPress={() => void reset()}
          variant="secondary"
          fullWidth
        />
      </View>
    </View>
  );
}
