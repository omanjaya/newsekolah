import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getApiClient, setOnUnauthorized } from "@/lib/api/client";
import { markAuthRedirect } from "@/lib/api/auth-redirect-flag";
import type { ClientKind, Me, ProfileKind } from "@/lib/api/types";
import { loadTenantConfig } from "@/lib/tenant/tenant-store";
import { loadStoredTokens, secureTokenStore } from "@/lib/auth/token-store";
import { getStableDeviceId, getDeviceName } from "@/lib/auth/device";
import { isBiometricUnlockAvailable, unlockWithBiometrics } from "@/lib/auth/biometric";
import { resolveDefaultTabGroup, resolveTabGroups } from "@/lib/auth/roles";
import { registerPushDevice } from "@/lib/push/register-device";

const BIOMETRIC_PREF_KEY = "newsekolah.biometric_unlock_enabled";

type AuthStatus = "booting" | "locked" | "signed-out" | "signed-in";

interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  activeTabGroup: ProfileKind | null;
  availableTabGroups: ProfileKind[];
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  unlock: () => Promise<boolean>;
  refreshMe: () => Promise<void>;
  setActiveTabGroup: (kind: ProfileKind) => void;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [me, setMe] = useState<Me | null>(null);
  const [activeTabGroup, setActiveTabGroupState] = useState<ProfileKind | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  const finishSignIn = useCallback((nextMe: Me) => {
    setMe(nextMe);
    setActiveTabGroupState(resolveDefaultTabGroup(nextMe));
    setStatus("signed-in");
    // Best effort: a denied permission or an Expo Go build without push
    // credentials must never block sign-in.
    void registerPushDevice().catch(() => undefined);
  }, []);

  const handleSessionExpired = useCallback(() => {
    // Before the state change below, so any mutation already in flight that
    // rejects with the same 401 in this tick skips its own "session
    // expired" toast (see auth-redirect-flag.ts).
    markAuthRedirect();
    setMe(null);
    setActiveTabGroupState(null);
    setStatus("signed-out");
  }, []);

  useEffect(() => {
    // The api client calls this when a 401 survives its own refresh attempt
    // (see @newsekolah/api-client's onUnauthorized, wired in lib/api/client.ts).
    setOnUnauthorized(handleSessionExpired);

    void (async () => {
      await loadTenantConfig();
      const [{ accessToken }, biometricPref, biometricHardware] = await Promise.all([
        loadStoredTokens(),
        SecureStore.getItemAsync(BIOMETRIC_PREF_KEY),
        isBiometricUnlockAvailable(),
      ]);

      setBiometricAvailable(biometricHardware);
      const wantsBiometric = biometricPref === "1" && biometricHardware;
      setBiometricEnabledState(wantsBiometric);

      if (!accessToken) {
        setStatus("signed-out");
        return;
      }

      if (wantsBiometric) {
        setStatus("locked");
        return;
      }

      try {
        finishSignIn(await getApiClient().GET("/v1/me"));
      } catch {
        await secureTokenStore.clear();
        setStatus("signed-out");
      }
    })();
  }, [finishSignIn, handleSessionExpired]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const deviceId = await getStableDeviceId();
      const client: ClientKind = Platform.OS === "ios" ? "ios" : "android";
      const tokens = await getApiClient().POST("/v1/auth/login", {
        body: {
          username,
          password,
          client,
          device_id: deviceId,
          device_name: getDeviceName(),
        },
      });
      await secureTokenStore.setTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      finishSignIn(tokens.user);
    },
    [finishSignIn],
  );

  const signOut = useCallback(async () => {
    try {
      await getApiClient().POST("/v1/auth/logout");
    } catch {
      // Best-effort: proceed with local sign-out even if the network call fails,
      // the device is being wiped from the user's perspective either way.
    }
    await secureTokenStore.clear();
    handleSessionExpired();
  }, [handleSessionExpired]);

  const unlock = useCallback(async () => {
    const success = await unlockWithBiometrics();
    if (!success) return false;
    try {
      finishSignIn(await getApiClient().GET("/v1/me"));
      return true;
    } catch {
      await secureTokenStore.clear();
      setStatus("signed-out");
      return false;
    }
  }, [finishSignIn]);

  const refreshMe = useCallback(async () => {
    const nextMe = await getApiClient().GET("/v1/me");
    setMe(nextMe);
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    setBiometricEnabledState(enabled);
    await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? "1" : "0");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      activeTabGroup,
      availableTabGroups: me ? resolveTabGroups(me) : [],
      biometricAvailable,
      biometricEnabled,
      signIn,
      signOut,
      unlock,
      refreshMe,
      setActiveTabGroup: setActiveTabGroupState,
      setBiometricEnabled,
    }),
    [
      status,
      me,
      activeTabGroup,
      biometricAvailable,
      biometricEnabled,
      signIn,
      signOut,
      unlock,
      refreshMe,
      setBiometricEnabled,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
