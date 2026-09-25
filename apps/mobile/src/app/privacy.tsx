import { Linking, ScrollView, Text, View } from "react-native";
import { Bell, Camera, HardDrive } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/t";

/** Store review requires a privacy policy reachable from inside the app
 * (docs/12-roadmap.md, "Review App Store" risk row) and a permission
 * rationale for camera and notifications in the reviewer's own language,
 * not just the OS permission prompt. The full policy lives on the school's
 * own site (tenant.privacy_policy_url once that field exists -- see the
 * PRIVACY_POLICY_URL fallback below); this screen is the in-app summary
 * plus the link out to it. */
const PRIVACY_POLICY_URL = "https://newsekolah.id/privasi";

function Item({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <View className="flex-row gap-3 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Icon size={20} strokeWidth={1.75} color="#0F7A5F" />
      <View className="flex-1 gap-1">
        <Text className="text-base font-medium text-ink dark:text-ink-dark">{title}</Text>
        <Text className="text-sm text-ink/70 dark:text-ink-dark/70">{body}</Text>
      </View>
    </View>
  );
}

export default function PrivacyPolicyRoute(): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("privacy.title")} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text className="text-sm text-ink/70 dark:text-ink-dark/70">{t("privacy.intro")}</Text>
        <Item icon={Camera} title={t("privacy.camera_title")} body={t("privacy.camera_body")} />
        <Item
          icon={Bell}
          title={t("privacy.notifications_title")}
          body={t("privacy.notifications_body")}
        />
        <Item
          icon={HardDrive}
          title={t("privacy.storage_title")}
          body={t("privacy.storage_body")}
        />
        <Button
          label={t("privacy.open_full")}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
      </ScrollView>
    </View>
  );
}
