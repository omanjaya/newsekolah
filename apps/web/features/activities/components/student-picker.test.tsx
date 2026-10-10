import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "s1", name: "Sari" }]);
});

import { StudentName, StudentPicker } from "./student-picker";

describe("StudentPicker", () => {
  it("searches students and reports the picked id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StudentPicker value="" onChange={onChange} />);

    const picker = screen.getByRole("combobox", { name: "choose" });
    expect(picker).toHaveAttribute("data-kind", "student");
    await user.click(picker);

    expect(onChange).toHaveBeenCalledWith("picked-1");
  });
});

describe("StudentName", () => {
  it("shows the name of a known student and the fallback for an unknown one", () => {
    render(
      <>
        <span data-testid="known">
          <StudentName id="s1" />
        </span>
        <span data-testid="unknown">
          <StudentName id="gone" />
        </span>
      </>,
    );

    expect(screen.getByTestId("known")).toHaveTextContent("Sari");
    expect(screen.getByTestId("unknown")).toHaveTextContent("unknown");
  });
});
