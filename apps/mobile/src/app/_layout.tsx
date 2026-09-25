import "@/global.css";
import { useEffect, useMemo } from "react";
import { useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { ToastHost } from "@/components/ui/Toast";
import { accentVars } from "@/theme/accent";
import { useLoadThemeFonts } from "@/theme/typography";
import { useOfflineSyncLoop } from "@/lib/offline/sync";
import { LiveSocketProvider } from "@/lib/realtime/live-socket-provider";
import { NotificationsRealtimeBridge } from "@/lib/realtime/notifications-bridge";
import { createMutationCache } from "@/lib/api/mutation-cache";

// Kept visible until the Hijau Segar fonts (Manrope, Plus Jakarta Sans) have
// loaded -- see AccentRoot below -- so the app never flashes an unstyled
// screen before the real typeface is ready. Screens opt into the loaded
// fonts through the `font-heading*`/`font-body*` classes (see
// tailwind.config.js) or an inline fontFamily -- React Native has no CSS-style
// font inheritance, and React 19 dropped defaultProps for function
// components, so there is no single place to patch a document-wide default.
void SplashScreen.preventAutoHideAsync();

// One shared query client for the whole app; screens define their own query
// keys under features/*/keys.ts once that layer exists.
// mutationCache: every mutation's default success/error toast, see
// lib/api/mutation-cache.ts.
const queryClient = new QueryClient({
  mutationCache: createMutationCache(),
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AccentRoot({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const { me } = useAuth();
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  // Attendance taken offline queues locally (see lib/offline/queue.ts) and
  // needs a foreground/interval flush loop to leave the queue -- this is
  // the one place that loop is mounted so it runs exactly once per app
  // instance, before role changes.
  useOfflineSyncLoop();
  // Hijau Segar loads Manrope and Plus Jakarta Sans on every platform (both
  // iOS and Android show the same typeface now, unlike the old Inter setup
  // this replaces which only loaded on Android).
  const fontsLoaded = useLoadThemeFonts();
  const style = useMemo(
    () => accentVars(me?.tenant.accent_color, colorScheme),
    [me?.tenant.accent_color, colorScheme],
  );

  useEffect(() => {
    if (!fontsLoaded) return;
    void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  // The realtime connection (lib/realtime) only makes sense once there is a
  // session to authenticate it with -- mounting/unmounting LiveSocketProvider
  // here is how it starts and fully tears down across sign-in/sign-out,
  // rather than the connection itself watching auth state.
  const body = me ? (
    <LiveSocketProvider>
      <NotificationsRealtimeBridge />
      {children}
    </LiveSocketProvider>
  ) : (
    children
  );

  return (
    <View style={style} className="flex-1 bg-bg dark:bg-bg-dark">
      {body}
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
