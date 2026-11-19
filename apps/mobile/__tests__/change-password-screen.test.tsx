import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ChangePassword from "@/app/(auth)/change-password";
import { setLocale } from "@/i18n/t";

// The screen validates with @newsekolah/schemas before it calls the API, and
// shows the first zod issue as text. A length message needs the limit its
// schema enforces ({max}); without it the shared translator used to throw
// during render on web, and showed the raw pattern here.

const mockMutateAsync = jest.fn();

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), back: jest.fn() } }));
jest.mock("@newsekolah/api-client/react", () => ({
  useChangePassword: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock("@/lib/api/client", () => ({ getApiClient: () => ({}) }));
jest.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ refreshMe: jest.fn() }) }));

beforeAll(() => setLocale("id"));
beforeEach(() => mockMutateAsync.mockReset());

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

async function renderScreen(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ChangePassword />
    </SafeAreaProvider>,
  );
}

describe("ChangePassword screen validation", () => {
  it("shows the length limit in the message for a too-long new password", async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Kata sandi saat ini"), "sandi-lama");
    await fireEvent.changeText(screen.getByLabelText("Kata sandi baru"), "x".repeat(129));
    await fireEvent.press(screen.getByRole("button", { name: "Ubah kata sandi" }));

    expect(await screen.findByText("Kata sandi maksimal 128 karakter")).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the submit disabled below the shared minimum length", async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Kata sandi saat ini"), "sandi-lama");
    await fireEvent.changeText(screen.getByLabelText("Kata sandi baru"), "abcdefg");

    expect(screen.getByRole("button", { name: "Ubah kata sandi" })).toBeDisabled();
  });
});
