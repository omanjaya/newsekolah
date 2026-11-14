import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type * as Api from "../api";

import { TemplateEditorView } from "./template-editor";

const push = vi.fn();
const update = vi.fn();
const template = {
  id: "t1",
  kind: "leave_letter",
  name: "Surat izin",
  engine: "html",
  body: "<p>Halo </p>",
  is_default: false,
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
};

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { permissions: [], disabled_modules: [] } }),
}));
vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  useDocumentTemplatesQuery: () => ({ data: { data: [template] }, isLoading: false }),
  useCreateDocumentTemplateMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateDocumentTemplateMutation: () => ({ mutate: update, isPending: false }),
}));

beforeEach(() => {
  push.mockClear();
  update.mockClear();
});
afterEach(cleanup);

it("inserts a placeholder at the cursor and offers to save", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t1" />);
  expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();

  const body = screen.getByRole("textbox", { name: /bodyLabel/ });
  // The cursor sits just before "</p>".
  await user.click(body);
  (body as HTMLTextAreaElement).setSelectionRange(8, 8);
  await user.click(screen.getByRole("button", { name: "student_name" }));
  expect(body).toHaveValue("<p>Halo {{student_name}}</p>");

  await user.click(screen.getByRole("button", { name: "save" }));
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ templateId: "t1", variables: ["student_name"] }),
    expect.anything(),
  );
});

it("says so when the template does not exist", () => {
  render(<TemplateEditorView templateId="missing" />);
  expect(screen.getByText("editor.notFoundTitle")).toBeInTheDocument();
});
