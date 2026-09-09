// Holds the two things @newsekolah/api-client needs before a session exists:
// which school (X-Tenant) and which server (base URL override for
// self-hosted schools reached from the login screen's "Ganti alamat server"
// link). src/lib/api/client.ts reads both of these to build the client.

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const TENANT_SLUG_KEY = "newsekolah.tenant_slug";
const SERVER_URL_KEY = "newsekolah.server_url_override";

function defaultBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return extra?.apiUrl ?? "http://localhost:8080";
}

function defaultTenantSlug(): string | null {
  const extra = Constants.expoConfig?.extra as { defaultTenant?: string } | undefined;
  const value = extra?.defaultTenant;
  return value && value.length > 0 ? value : null;
}

let tenantSlug: string | null = null;
let baseUrl: string = defaultBaseUrl();
let loaded = false;

export async function loadTenantConfig(): Promise<void> {
  const [storedSlug, storedUrl] = await Promise.all([
    SecureStore.getItemAsync(TENANT_SLUG_KEY),
    SecureStore.getItemAsync(SERVER_URL_KEY),
  ]);
  tenantSlug = storedSlug ?? defaultTenantSlug();
  baseUrl = storedUrl ?? defaultBaseUrl();
  loaded = true;
}

export function isTenantConfigLoaded(): boolean {
  return loaded;
}

export function getTenantSlug(): string | null {
  return tenantSlug;
}

export async function setTenantSlug(slug: string): Promise<void> {
  tenantSlug = slug;
  await SecureStore.setItemAsync(TENANT_SLUG_KEY, slug);
}

export function getBaseUrl(): string {
  return baseUrl;
}

export async function setBaseUrlOverride(url: string): Promise<void> {
  baseUrl = url;
  await SecureStore.setItemAsync(SERVER_URL_KEY, url);
}

export async function resetBaseUrlOverride(): Promise<void> {
  baseUrl = defaultBaseUrl();
  await SecureStore.deleteItemAsync(SERVER_URL_KEY);
}
