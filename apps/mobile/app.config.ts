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
  // `name` and `slug` are internal identifiers (EAS project/update matching,
  // dev client labeling) and stay "newsekolah"-based alongside the hardcoded
  // bundle ids below -- they are not the product name a user sees. The
  // on-device home screen label is set separately via
  // `ios.infoPlist.CFBundleDisplayName` to "SION": an interim product name,
  // not the final per-tenant branding (branding.name/short_name from
  // GET /v1/tenant/branding, shown inside the app itself, e.g. the login
  // screen) which this static config has no way to know at build time.
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
    // App Store rejects an icon with an alpha channel; icon.png (used for
    // Android's adaptive foreground and the splash mark, both of which
    // composite fine with transparency) keeps its alpha, so iOS gets its
    // own flattened, fully opaque copy instead of reusing it directly.
    icon: "./assets/images/icon-ios.png",
    infoPlist: {
      CFBundleDisplayName: "SION",
      NSCameraUsageDescription:
        "Kamera dipakai untuk memindai kode QR presensi, gerbang, dan izin keluar.",
      NSFaceIDUsageDescription: "Face ID dipakai untuk membuka akses tersimpan lebih cepat.",
    },
  },
  android: {
    package: "id.newsekolah.mobile",
    adaptiveIcon: {
      backgroundColor: "#F7F6F2",
      foregroundImage: "./assets/images/icon.png",
    },
    // POST_NOTIFICATIONS (Android 13+) is added automatically by the
    // expo-notifications plugin below; listed here anyway so the manifest
    // reads as a complete, deliberate list rather than an implicit one.
    permissions: ["CAMERA", "USE_BIOMETRIC", "USE_FINGERPRINT", "POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-localization",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F7F6F2",
        image: "./assets/images/icon.png",
        imageWidth: 120,
        dark: {
          backgroundColor: "#141414",
          image: "./assets/images/icon.png",
          imageWidth: 120,
        },
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Kamera dipakai untuk memindai kode QR presensi, gerbang, dan izin keluar.",
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Face ID dipakai untuk membuka akses tersimpan lebih cepat.",
      },
    ],
    [
      "expo-notifications",
      {
        // Notifications tell a person about permits, attendance
        // corrections, and school announcements (see src/app/privacy.tsx
        // for the in-app explanation shown before the OS permission
        // prompt, since neither platform lets an app supply custom copy
        // inside that prompt itself).
        icon: "./assets/images/icon.png",
        color: "#0F7A5F",
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
