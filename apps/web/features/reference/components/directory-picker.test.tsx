import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api/client", () => ({ useApiClient: () => ({ GET: get }) }));

import { DIRECTORY_PICKER_LIMIT, DirectoryPicker } from "./directory-picker";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): undefined {
        return undefined;
      }
      unobserve(): undefined {
        return undefined;
      }
      disconnect(): undefined {
        return undefined;
      }
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

const labels = { placeholder: "Pick", searchPlaceholder: "Search", emptyLabel: "None" };

function renderPicker(onValueChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  get.mockImplementation((_path: string, init: { params: { query: { q: string } } }) =>
    Promise.resolve({
      data: [{ id: "u1", name: `Siswa ${init.params.query.q}`.trim(), username: "u1" }],
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <DirectoryPicker
        profileKind="student"
        value=""
        onValueChange={onValueChange}
        labels={labels}
      />
    </QueryClientProvider>,
  );
  return onValueChange;
}

describe("DirectoryPicker", () => {
  it("asks the server for a capped page instead of the whole roster", async () => {
    renderPicker();
    await waitFor(() => {
      expect(get).toHaveBeenCalled();
    });
    expect(get).toHaveBeenCalledWith("/v1/directory/users", {
      params: { query: { profile_kind: "student", q: "", limit: DIRECTORY_PICKER_LIMIT } },
    });
  });

  it("debounces typing into one server search and reports the picked label", async () => {
    const user = userEvent.setup();
    const onValueChange = renderPicker();

    await user.click(screen.getByRole("button", { name: "Pick" }));
    await user.type(screen.getByPlaceholderText("Search"), "ani");

    await waitFor(() => {
      expect(get).toHaveBeenLastCalledWith("/v1/directory/users", {
        params: { query: { profile_kind: "student", q: "ani", limit: DIRECTORY_PICKER_LIMIT } },
      });
    });
    // Initial empty query plus one debounced search, not one per keystroke.
    expect(get).toHaveBeenCalledTimes(2);

    await user.click(await screen.findByText("Siswa ani"));
    expect(onValueChange).toHaveBeenCalledWith("u1", "Siswa ani");
  });
});
