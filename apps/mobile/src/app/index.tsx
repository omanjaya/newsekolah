import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Fingerprint } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { getTenantSlug } from "@/lib/tenant/tenant-store";

const HOME_ROUTE_BY_GROUP = {
  student: "/(student)/home",
  teacher: "/(teacher)/home",
  staff: "/(staff)/home",
  parent: "/(parent)/home",
} as const;

function UnlockScreen(): React.JSX.Element {
  const { unlock } = useAuth();
  const [failed, setFailed] = useState(false);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-bg px-8 dark:bg-bg-dark">
      <Fingerprint size={40} strokeWidth={1.75} color="#1F3A5F" />
      <Text className="text-center text-md font-medium text-ink dark:text-ink-dark">
        Buka akses untuk melanjutkan
      </Text>
      {failed ? (
        <Text className="text-center text-sm text-status-absent">
          Verifikasi tidak berhasil. Coba lagi.
        </Text>
      ) : null}
      <Button
        label="Buka dengan sidik jari atau wajah"
        onPress={() => {
          void unlock().then((success) => setFailed(!success));
        }}
      />
    </View>
  );
}

export default function Index(): React.JSX.Element {
  const { status, me, activeTabGroup } = useAuth();

  if (status === "booting") {
    return (
      <View className="flex-1 items-center justify-center bg-bg dark:bg-bg-dark">
        <ActivityIndicator />
      </View>
    );
  }

  if (status === "locked") {
    return <UnlockScreen />;
  }

  if (status === "signed-out") {
    return <Redirect href={getTenantSlug() ? "/(auth)/login" : "/(auth)/school-picker"} />;
  }

  if (me?.must_change_password) {
    return <Redirect href="/(auth)/change-password" />;
  }

  const group = activeTabGroup ?? "staff";
  return <Redirect href={HOME_ROUTE_BY_GROUP[group]} />;
}
