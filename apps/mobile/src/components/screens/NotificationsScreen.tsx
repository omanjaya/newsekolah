import { View } from "react-native";
import { Bell } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/i18n/t";

/** Placeholder: no notifications endpoint in openapi/openapi.yaml yet. */
export function NotificationsScreen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("notifications.title")} />
      <EmptyState icon={Bell} title={t("notifications.empty")} />
    </View>
  );
}
