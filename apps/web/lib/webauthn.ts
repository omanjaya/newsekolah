/**
 * Thin wrapper around the browser's WebAuthn Level 3 JSON conversion
 * methods (`PublicKeyCredential.parseCreationOptionsFromJSON` /
 * `.parseRequestOptionsFromJSON` / credential `.toJSON()`). They are not
 * yet declared on every TypeScript `lib.dom.d.ts` this repo might build
 * against, so they are typed narrowly here instead of widening the global
 * `PublicKeyCredential` type project-wide.
 */

interface PublicKeyCredentialWithJSON extends PublicKeyCredential {
  toJSON(): Record<string, unknown>;
}

interface PublicKeyCredentialStaticJSON {
  parseCreationOptionsFromJSON(
    options: Record<string, unknown>,
  ): PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON(options: Record<string, unknown>): PublicKeyCredentialRequestOptions;
}

function staticJSON(): PublicKeyCredentialStaticJSON {
  return PublicKeyCredential as unknown as PublicKeyCredentialStaticJSON;
}

/** True when this browser can attempt a WebAuthn ceremony at all. */
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

/**
 * Runs `navigator.credentials.create()` from the server's creation
 * options (as returned by `POST /v1/me/passkeys/options`) and returns the
 * browser's response, JSON-shaped for `POST /v1/me/passkeys`.
 */
export async function createPasskey(
  publicKey: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const options = staticJSON().parseCreationOptionsFromJSON(publicKey);
  const credential = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredentialWithJSON | null;
  if (!credential) {
    throw new Error("Passkey creation was cancelled");
  }
  return credential.toJSON();
}

/**
 * Runs `navigator.credentials.get()` from the server's request options
 * (as returned by `POST /v1/auth/passkeys/login/options`) and returns the
 * browser's response, JSON-shaped for `POST /v1/auth/passkeys/login`.
 */
export async function getPasskey(
  publicKey: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const options = staticJSON().parseRequestOptionsFromJSON(publicKey);
  const credential = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredentialWithJSON | null;
  if (!credential) {
    throw new Error("Passkey sign-in was cancelled");
  }
  return credential.toJSON();
}
