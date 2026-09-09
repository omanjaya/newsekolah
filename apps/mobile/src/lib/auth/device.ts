// Device identity is a mobile-only concern -- @newsekolah/api-client has no
// notion of it, it only accepts `device_id`/`device_name` as opaque strings
// on LoginRequest -- so this stays a local helper rather than something the
// shared package can own.

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";

const DEVICE_ID_KEY = "newsekolah.device_id";

/** A stable id for this install, generated once and persisted. Used as
 * `device_id` on LoginRequest so the server can name and later revoke sessions. */
export async function getStableDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const generated = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}

/** Human-readable device label for the sessions list, e.g. "iPhone 15". */
export function getDeviceName(): string {
  return Device.deviceName ?? Device.modelName ?? "Perangkat tidak dikenal";
}
