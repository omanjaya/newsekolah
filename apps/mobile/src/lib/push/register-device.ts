// Registers this device's native push token with the API so APNs/FCM
// deliveries reach it. The Expo push token from register.ts is for Expo's
// relay; the API's senders talk to APNs and FCM directly, so the native
// token is what gets stored.
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getApiClient } from "@/lib/api/client";
import { registerForPushNotifications } from "@/lib/push/register";

export async function registerPushDevice(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  const { granted } = await registerForPushNotifications();
  if (!granted) return;
  const native = await Notifications.getDevicePushTokenAsync();
  const token = typeof native.data === "string" ? native.data : JSON.stringify(native.data);
  await getApiClient().POST("/v1/push-devices", {
    body: {
      platform: Platform.OS,
      token_or_endpoint: token,
      device_name: Device.deviceName ?? `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(),
    },
  });
}
