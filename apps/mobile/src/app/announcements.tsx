import { ScrollView, View } from "react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { AnnouncementsList } from "@/components/screens/AnnouncementsList";
import { t } from "@/i18n/t";

export default function AnnouncementsRoute(): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("announcements.title")} showBack />
      <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingBottom: 48 }}>
        <AnnouncementsList />
      </ScrollView>
    </View>
  );
}
