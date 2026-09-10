/**
 * Web Push subscription, kept apart from the React layer because every
 * step here is a browser API that either does not exist or is refused
 * outright, and each of those cases has to be told apart from a genuine
 * failure. The caller gets a `PushState` rather than a thrown error.
 */

/** What the browser will let this viewer do about push right now. */
export type PushState =
  /** No service worker, no PushManager, or no key configured for this deployment. */
  | "unsupported"
  /** Supported, no subscription yet, and the viewer has not been asked. */
  | "idle"
  /** Subscribed and registered with the server. */
  | "enabled"
  /** The viewer refused, and only their browser settings can undo that. */
  | "denied";

/**
 * The VAPID public key is a build-time value: it identifies the server to
 * the push service and is meant to be public. With no key configured the
 * feature reports itself unsupported rather than failing at subscribe
 * time, so a deployment without web push simply never offers it.
 */
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * `applicationServerKey` wants raw bytes, and VAPID keys travel as
 * base64url. Browsers give us base64 decoding only, so translate the
 * alphabet and restore the padding first.
 */
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  // Backed by a plain ArrayBuffer, not a SharedArrayBuffer: only the
  // former satisfies BufferSource for applicationServerKey.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** The shape the server's `POST /v1/push-devices` expects for a browser. */
export interface WebPushRegistration {
  platform: "web";
  token_or_endpoint: string;
  p256dh: string;
  auth_key: string;
  device_name: string;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    vapidPublicKey !== ""
  );
}

/**
 * A name the viewer will recognise in their device list. The user agent
 * string is the only hint a browser gives, so pick the engine out of it
 * and accept that two Chrome windows look alike.
 */
function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = ua.includes("Firefox/")
    ? "Firefox"
    : ua.includes("Edg/")
      ? "Edge"
      : ua.includes("Chrome/")
        ? "Chrome"
        : ua.includes("Safari/")
          ? "Safari"
          : "Browser";
  const platform = ua.includes("Android")
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : ua.includes("Macintosh")
        ? "macOS"
        : ua.includes("Windows")
          ? "Windows"
          : "";
  return platform ? `${browser} di ${platform}` : browser;
}

function toRegistration(subscription: PushSubscription): WebPushRegistration {
  return {
    platform: "web",
    token_or_endpoint: subscription.endpoint,
    p256dh: encodeBase64Url(subscription.getKey("p256dh")),
    auth_key: encodeBase64Url(subscription.getKey("auth")),
    device_name: deviceName(),
  };
}

/** What this browser can do about push, without asking the viewer anything. */
export async function readPushState(): Promise<PushState> {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "idle";
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "idle";
}

/** The current subscription, if this browser already has one. */
export async function currentSubscription(): Promise<WebPushRegistration | null> {
  if (!isSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? toRegistration(subscription) : null;
}

/**
 * Asks for permission and subscribes. Returns the registration to send
 * to the server, or null when the viewer refused: a refusal is an answer,
 * not an error, and the caller should show the denied state rather than a
 * failure message.
 */
export async function subscribeToPush(): Promise<WebPushRegistration | null> {
  if (!isSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  // Re-registering an existing subscription is what refreshes it on the
  // server, so keep it rather than churning the endpoint on every toggle.
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(vapidPublicKey),
    }));
  return toRegistration(subscription);
}

/**
 * Drops the local subscription and returns the endpoint the server should
 * forget. Returns null when there was nothing subscribed.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}
