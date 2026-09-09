import { useState } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { House, Bell, CircleUser } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { RaisedTabBar } from "@/components/nav/RaisedTabBar";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/i18n/t";

const ICONS: Record<string, LucideIcon> = { home: House, notifications: Bell, profile: CircleUser };
const LABELS: Record<string, string> = {
  home: t("home.title"),
  notifications: t("notifications.title"),
  profile: t("profile.title"),
};

interface CenterActionConfig {
  icon: LucideIcon;
  label: string;
  renderSheetContent: () => React.ReactNode;
}

interface RoleTabsLayoutProps {
  centerAction?: CenterActionConfig;
}

/** Shared shell for every role's tab group: same three tabs (home,
 * notifications, profile) in every (student|teacher|staff|parent) directory,
 * with an optional raised center action (docs/07-ui-ux.md). */
export function RoleTabsLayout({ centerAction }: RoleTabsLayoutProps): React.JSX.Element {
  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <RaisedTabBar
            {...props}
            icons={ICONS}
            labels={LABELS}
            centerAction={
              centerAction
                ? {
                    icon: centerAction.icon,
                    label: centerAction.label,
                    onPress: () => setSheetVisible(true),
                  }
                : undefined
            }
          />
        )}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
      </Tabs>

      {centerAction ? (
        <Sheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          title={centerAction.label}
        >
          {centerAction.renderSheetContent()}
        </Sheet>
      ) : null}
    </View>
  );
}
