import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "id" }));

import { GradebookScoreCell } from "./gradebook-score-cell";

function renderCell(props: { value?: string; onPasteBlock?: () => void } = {}) {
  const onCommit = vi.fn();
  render(
    <GradebookScoreCell
      studentId="s1"
      componentId="c1"
      rowIndex={0}
      value={props.value ?? ""}
      ariaLabel="Nilai UH2 Siswa Contoh"
      min={0}
      max={100}
      rangeHint="Nilai 0-100"
      formatHint="Isi angka, mis. 78,5"
      onCommit={onCommit}
      onRegisterRef={vi.fn()}
      onPasteBlock={props.onPasteBlock}
    />,
  );
  return { onCommit, input: screen.getByRole("textbox", { name: "Nilai UH2 Siswa Contoh" }) };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GradebookScoreCell", () => {
  it("keeps a comma decimal as typed, valid, instead of turning 8,5 into 85", () => {
    const { input } = renderCell();
    fireEvent.change(input, { target: { value: "8,5" } });
    expect(input).toHaveValue("8,5");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("names the problem for text that is not a number", () => {
    const { input } = renderCell();
    fireEvent.change(input, { target: { value: "1.234,5" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Isi angka, mis. 78,5");
  });

  it("keeps the range hint for a number outside the scale", () => {
    const { input } = renderCell();
    fireEvent.change(input, { target: { value: "105" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Nilai 0-100");
  });

  it("shows the first value of a pasted comma-decimal block instead of a blank cell", () => {
    const onPasteBlock = vi.fn();
    const { input } = renderCell({ onPasteBlock });
    fireEvent.paste(input, { clipboardData: { getData: () => "78,5\n91,25\n" } });
    expect(input).toHaveValue("78,5");
    expect(onPasteBlock).toHaveBeenCalledWith("c1", "s1", [["78,5"], ["91,25"]]);
  });

  it("does not let a stale debounced keystroke land after the blur committed", () => {
    vi.useFakeTimers();
    const { input, onCommit } = renderCell();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("reads a read-only comma decimal as a score, not as a dash", () => {
    render(
      <GradebookScoreCell
        studentId="s1"
        componentId="c1"
        rowIndex={0}
        value="8,5"
        readOnly
        decimals={2}
        ariaLabel="Nilai UH2 Siswa Contoh"
        onCommit={vi.fn()}
        onRegisterRef={vi.fn()}
      />,
    );
    expect(screen.getByText("8,5")).toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });
});
