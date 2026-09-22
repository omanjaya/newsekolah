import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafeHtml } from "./safe-html.js";

describe("SafeHtml", () => {
  it("keeps benign formatting markup", () => {
    const { container } = render(<SafeHtml html="<p>Hello <b>world</b></p>" />);
    expect(container.querySelector("p")?.innerHTML).toBe("Hello <b>world</b>");
  });

  it("strips a script tag even when the server-side sanitiser is bypassed", () => {
    const { container } = render(
      <SafeHtml html="<p>hi</p><script>window.__xss = true;</script>" />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("__xss");
  });

  it("strips an inline event-handler attribute", () => {
    const { container } = render(<SafeHtml html='<img src="x" onerror="alert(1)" />' />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("onerror")).toBeNull();
  });

  it("applies the given className to the wrapper", () => {
    const { container } = render(<SafeHtml html="<p>hi</p>" className="prose-announcement" />);
    expect(container.firstElementChild).toHaveClass("prose-announcement");
  });
});
