import "@/global.css";
import { useMemo } from "react";
import { useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts, Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { Platform } from "react-native";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { ToastHost } from "@/components/ui/Toast";
import { accentVars } from "@/theme/accent";
import { useOfflineSyncLoop } from "@/lib/offline/sync";

// One shared query client for the whole app; screens define their own query
// keys under features/*/keys.ts once that layer exists.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AccentRoot({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { me } = useAuth();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  // Attendance taken offline queues locally (see lib/offline/queue.ts) and
  // needs a foreground/interval flush loop to leave the queue -- this is
  // the one place that loop is mounted so it runs exactly once per app
  // instance, before role changes.
  useOfflineSyncLoop();
  // DESIGN.md: Inter on web/Android, the iOS system font (San Francisco) on
  // iOS -- so the Inter files are only loaded when they will actually render.
  const [fontsLoaded] = useFonts(
    Platform.OS === "android" ? { Inter_400Regular, Inter_500Medium } : {},
  );
  const style = useMemo(
    () => accentVars(me?.tenant.accent_color, colorScheme),
    [me?.tenant.accent_color, colorScheme],
  );

  if (Platform.OS === "android" && !fontsLoaded) {
    return <View className="flex-1 bg-bg dark:bg-bg-dark" />;
  }

  return (
    <View style={style} className="flex-1 bg-bg dark:bg-bg-dark">
      {children}
      <ToastHost />
    </View>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AccentRoot>
              <Stack screenOptions={{ headerShown: false }} />
            </AccentRoot>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
