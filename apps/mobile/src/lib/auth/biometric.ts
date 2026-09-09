// Local unlock gate only: biometrics never produce a token or talk to the
// server. They gate whether the app is allowed to read the tokens already
// sitting in SecureStore. See session-store.ts for where this is used.

import * as LocalAuthentication from "expo-local-authentication";

export async function isBiometricUnlockAvailable(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Buka akses newsekolah",
    cancelLabel: "Batal",
    disableDeviceFallback: false,
  });
  return result.success;
}
