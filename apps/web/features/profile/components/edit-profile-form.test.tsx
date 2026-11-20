import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditProfileForm } from "./edit-profile-form";

const mutateAsync = vi.fn();
interface MeStub {
  name: string;
  username: string;
  email: string;
  locale?: "id" | "en";
}
const me = vi.hoisted(() => {
  const current: MeStub = {
    name: "Budi",
    username: "budi",
    email: "budi@contoh.sch.id",
    locale: "en",
  };
  return { current };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  // The page is still in the school's language when the form first renders.
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: me.current }),
}));
vi.mock("../api", () => ({
  useUpdateProfileMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("./profile-save-bar", () => ({
  ProfileSaveBar: ({ dirty, onSave }: { dirty: boolean; onSave: () => void }) =>
    dirty ? (
      <button type="button" onClick={onSave}>
        save
      </button>
    ) : null,
}));

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  me.current = { ...me.current, locale: "en" };
});

describe("EditProfileForm language preference", () => {
  it("shows the stored preference, not the page's current language", () => {
    render(<EditProfileForm />);
    expect(screen.getByRole("combobox")).toHaveTextContent("localeEn");
    // Nothing changed yet, so there is nothing to save.
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
  });

  it("leaves the preference out when another field is saved", async () => {
    mutateAsync.mockResolvedValue({});
    render(<EditProfileForm />);
    fireEvent.change(screen.getByDisplayValue("Budi"), { target: { value: "Budi Santoso" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
    const body = mutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.name).toBe("Budi Santoso");
    expect(body).not.toHaveProperty("locale");
  });

  it("shows the school's language when the user never chose one", () => {
    me.current = { name: "Budi", username: "budi", email: "budi@contoh.sch.id" };
    render(<EditProfileForm />);
    expect(screen.getByRole("combobox")).toHaveTextContent("localeSchool");
  });
});
