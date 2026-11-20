import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockAction } from "./block-action";

afterEach(cleanup);

describe("BlockAction", () => {
  it("tells a mouse user why a locked block cannot be edited, and does nothing", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <BlockAction
        label="Ubah jadwal"
        icon={<Pencil aria-hidden="true" />}
        lockedReason="terkunci, jadwal ini sudah punya riwayat presensi"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Ubah jadwal" });
    // Live, `pointer-events: none` kept the hover from ever reaching the
    // button; jsdom does not apply it, so the class itself is checked.
    expect(button).not.toHaveClass("aria-disabled:pointer-events-none");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Ubah jadwal: terkunci, jadwal ini sudah punya riwayat presensi",
    );
    // A screen reader already says the name; the description is the reason.
    expect(button).toHaveAccessibleDescription("terkunci, jadwal ini sudah punya riwayat presensi");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("acts on a click when the block is not locked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<BlockAction label="Salin" icon={<Pencil aria-hidden="true" />} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Salin" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
