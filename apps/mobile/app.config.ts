import type { ExpoConfig, ConfigContext } from "expo/config";

// EXPO_PUBLIC_* env vars are inlined at build time and readable from
// process.env in both app code and this config file. Read through a typed
// view: some ambient RN/Expo type declarations widen the global `process` to
// `any`, which would otherwise leak into everything derived from it below.
const env = process.env as Record<string, string | undefined>;
const apiUrl = env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";
const defaultTenant = env.EXPO_PUBLIC_DEFAULT_TENANT ?? "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "newsekolah",
  slug: "newsekolah",
  scheme: "newsekolah",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/images/icon.png",
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: "id.newsekolah.mobile",
    infoPlist: {
      NSCameraUsageDescription: "Kamera dipakai untuk memindai kode QR presensi dan gerbang.",
      NSFaceIDUsageDescription: "Face ID dipakai untuk membuka akses tersimpan lebih cepat.",
    },
  },
  android: {
    package: "id.newsekolah.mobile",
    adaptiveIcon: {
      backgroundColor: "#F7F6F3",
      foregroundImage: "./assets/images/icon.png",
    },
    permissions: ["CAMERA", "USE_BIOMETRIC", "USE_FINGERPRINT"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-localization",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F7F6F3",
        image: "./assets/images/icon.png",
        imageWidth: 120,
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Kamera dipakai untuk memindai kode QR presensi dan gerbang.",
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Face ID dipakai untuk membuka akses tersimpan lebih cepat.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl,
    defaultTenant,
    eas: {
      projectId: env.EAS_PROJECT_ID ?? "",
    },
  },
  updates: {
    url: env.EAS_UPDATE_URL,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
});
