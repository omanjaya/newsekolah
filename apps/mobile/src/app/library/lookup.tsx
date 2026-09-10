import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/t";

/**
 * Identifies a member before borrowing, returning, or reviewing their
 * loans. There is no member-search endpoint the librarian role can call
 * and membership cards do not yet print a scannable code
 * (docs/12-roadmap.md Fase 4 gaps) -- so, for now, the librarian types or
 * pastes the member's user id, same as the "manual entry" escape hatch on
 * the shared scanner.
 */
export default function LibraryLookupRoute(): React.JSX.Element {
  const [memberUserId, setMemberUserId] = useState("");

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("library.lookup_title")} showBack />
      <View className="gap-3 p-4">
        <Input
          label={t("library.lookup_label")}
          value={memberUserId}
          onChangeText={setMemberUserId}
          placeholder={t("library.lookup_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text className="text-xs text-ink/60 dark:text-ink-dark/60">
          {t("library.lookup_hint")}
        </Text>
        <Button
          label={t("library.lookup_submit")}
          disabled={!memberUserId.trim()}
          onPress={() => router.push(`/library/member/${memberUserId.trim()}`)}
        />
      </View>
    </View>
  );
}
