import { View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/t";

/** Center-action sheet content for students and staff: jump to the scanner. */
export function ScanSheet({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  return (
    <View className="gap-3 pb-4">
      <Button
        label={t("scan.title")}
        fullWidth
        onPress={() => {
          onNavigate?.();
          router.push("/scan");
        }}
      />
    </View>
  );
}
