// Temporary: replace with @newsekolah/api-client once published in the workspace
// (device registration should post through the generated client once the
// `push_devices` endpoint in docs/10-mobile-strategy.md exists).
//
// Registration helper only: requests permission and returns an Expo push
// token. Nothing calls this yet -- no screen wires it to a "send to server"
// step, since that endpoint does not exist in openapi/openapi.yaml yet.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

export interface PushRegistrationResult {
  granted: boolean;
  expoPushToken: string | null;
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }

  if (!granted) {
    return { granted: false, expoPushToken: null };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;

  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  return { granted: true, expoPushToken: token.data };
}
