import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../components/button.js";

import { useSingleFlight } from "./use-single-flight.js";

function Demo({ onSave }: { onSave: () => Promise<void> }) {
  const submit = useSingleFlight(onSave);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Button type="submit">Simpan</Button>
    </form>
  );
}

describe("useSingleFlight", () => {
  it("ignores a second submit dispatched before the first settles", async () => {
    let resolve: () => void = () => undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<Demo onSave={onSave} />);
    const button = screen.getByRole("button", { name: "Simpan" });

    // Two clicks in the same task, before React re-renders: a real double
    // click that lands ahead of any `isPending` update.
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => {
      fireEvent.click(button);
      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });

  it("releases the lock after a failure so the save can be retried", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    function Retry() {
      const submit = useSingleFlight(onSave as () => Promise<void>);
      return (
        <button
          type="button"
          onClick={() => {
            submit().catch(() => undefined);
          }}
        >
          Kirim
        </button>
      );
    }
    render(<Retry />);
    const button = screen.getByRole("button", { name: "Kirim" });
    fireEvent.click(button);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    fireEvent.click(button);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });
});
