import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { usePasskeySupported } from "./webauthn";

function Probe(): ReactElement {
  return <span>{usePasskeySupported() ? "passkey" : "none"}</span>;
}

describe("usePasskeySupported", () => {
  // The sign-in card used to grow by the divider and the passkey button a
  // frame after hydration; the server markup now includes them.
  it("assumes support in the server render, so passkey options are in the first paint", () => {
    expect(renderToString(<Probe />)).toContain("passkey");
  });
});
