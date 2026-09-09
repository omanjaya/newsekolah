import { ScrollView, Text, View } from "react-native";
import { CalendarClock } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth/AuthProvider";
import { t } from "@/i18n/t";

/**
 * Placeholder home: the real "today" summary needs a dedicated aggregation
 * endpoint (docs/10-mobile-strategy.md section 2, item 6: GET /me/home),
 * which is not in openapi/openapi.yaml yet. Wire this up once that lands.
 */
export function HomeScreen(): React.JSX.Element {
  const { me } = useAuth();

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("home.title")} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="px-4 pt-4">
          <Text className="text-md font-medium text-ink dark:text-ink-dark">{me?.name}</Text>
        </View>
        <EmptyState
          icon={CalendarClock}
          title="Ringkasan hari ini belum tersedia"
          description="Layar ini akan menampilkan jadwal dan tugas begitu API ringkasan beranda siap."
        />
      </ScrollView>
    </View>
  );
}
