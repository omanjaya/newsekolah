// Temporary: replace with @newsekolah/api-client once published in the workspace
// for the parts of this that are really a generated auth hook.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import * as SecureStore from "expo-secure-store";
import * as api from "@/lib/api";
import type { ClientKind, Me } from "@/lib/api-types";
import { loadTenantConfig } from "@/lib/tenant/tenant-store";
import {
  loadStoredTokens,
  persistTokens,
  clearTokens,
  wireApiAuth,
} from "@/lib/auth/session-store";
import { getStableDeviceId, getDeviceName } from "@/lib/auth/device";
import { isBiometricUnlockAvailable, unlockWithBiometrics } from "@/lib/auth/biometric";
import { resolveDefaultTabGroup, resolveTabGroups } from "@/lib/auth/roles";
import type { ProfileKind } from "@/lib/api-types";
import { Platform } from "react-native";

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
  }, []);

  const handleSessionExpired = useCallback(() => {
    setMe(null);
    setActiveTabGroupState(null);
    setStatus("signed-out");
  }, []);

  useEffect(() => {
    wireApiAuth(handleSessionExpired);

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
        finishSignIn(await api.getMe());
      } catch {
        await clearTokens();
        setStatus("signed-out");
      }
    })();
  }, [finishSignIn, handleSessionExpired]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const deviceId = await getStableDeviceId();
      const client: ClientKind = Platform.OS === "ios" ? "ios" : "android";
      const tokens = await api.login({
        username,
        password,
        client,
        device_id: deviceId,
        device_name: getDeviceName(),
      });
      await persistTokens(tokens);
      finishSignIn(tokens.user);
    },
    [finishSignIn],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Best-effort: proceed with local sign-out even if the network call fails,
      // the device is being wiped from the user's perspective either way.
    }
    await clearTokens();
    handleSessionExpired();
  }, [handleSessionExpired]);

  const unlock = useCallback(async () => {
    const success = await unlockWithBiometrics();
    if (!success) return false;
    try {
      finishSignIn(await api.getMe());
      return true;
    } catch {
      await clearTokens();
      setStatus("signed-out");
      return false;
    }
  }, [finishSignIn]);

  const refreshMe = useCallback(async () => {
    const nextMe = await api.getMe();
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
