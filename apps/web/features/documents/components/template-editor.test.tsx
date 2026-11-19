import { cleanup, render, screen, within } from "@testing-library/react";
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
// Saved by the first editor, which wrote values without their dot: the
// API cannot parse it, so every letter issued from it fails.
const legacyTemplate = {
  ...template,
  id: "t2",
  name: "Surat izin lama",
  body: "<p>{{student_name}}</p>",
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
  useDocumentTemplatesQuery: () => ({
    data: { data: [template, legacyTemplate] },
    isLoading: false,
  }),
  useCreateDocumentTemplateMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateDocumentTemplateMutation: () => ({ mutate: update, isPending: false }),
}));

beforeEach(() => {
  push.mockClear();
  update.mockClear();
});
afterEach(cleanup);

it("inserts a value the way the API reads it, at the cursor, and offers to save", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t1" />);
  expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();

  const body = screen.getByRole("textbox", { name: /bodyLabel/ });
  // The cursor sits just before "</p>".
  await user.click(body);
  (body as HTMLTextAreaElement).setSelectionRange(8, 8);
  await user.click(screen.getByRole("button", { name: "student_name" }));
  expect(body).toHaveValue("<p>Halo {{.student_name}}</p>");

  await user.click(screen.getByRole("button", { name: "save" }));
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ templateId: "t1", variables: ["student_name"] }),
    expect.anything(),
  );
});

it("wraps the selected text in tags from the format toolbar and from Ctrl+B", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t1" />);
  const body = screen.getByRole<HTMLTextAreaElement>("textbox", { name: /bodyLabel/ });
  const toolbar = screen.getByRole("toolbar", { name: "toolbarLabel" });

  // "Halo" is selected.
  await user.click(body);
  body.setSelectionRange(3, 7);
  await user.click(within(toolbar).getByRole("button", { name: "format.bold" }));
  expect(body).toHaveValue("<p><strong>Halo</strong> </p>");

  body.setSelectionRange(11, 15);
  await user.keyboard("{Control>}i{/Control}");
  expect(body).toHaveValue("<p><strong><em>Halo</em></strong> </p>");

  await user.click(screen.getByRole("button", { name: "save" }));
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ body: "<p><strong><em>Halo</em></strong> </p>" }),
    expect.anything(),
  );
});

it("offers every value the API fills into a leave letter", () => {
  render(<TemplateEditorView templateId="t1" />);
  for (const name of ["nis", "address", "issuer_name", "homeroom_name"]) {
    expect(screen.getByRole("button", { name })).toHaveAttribute("title", `{{.${name}}}`);
  }
});

it("loads a body saved without the dots as it was, flags it and adds the dots on request", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t2" />);
  const body = screen.getByRole("textbox", { name: /bodyLabel/ });
  expect(body).toHaveValue("<p>{{student_name}}</p>");
  expect(screen.getByText("legacyTitle")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "legacyFix" }));
  expect(body).toHaveValue("<p>{{.student_name}}</p>");
  expect(screen.queryByText("legacyTitle")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "save" }));
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      templateId: "t2",
      body: "<p>{{.student_name}}</p>",
      variables: ["student_name"],
    }),
    expect.anything(),
  );
});

it("refuses to save a body that still holds a value without its dot", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t2" />);
  await user.type(screen.getByRole("textbox", { name: /bodyLabel/ }), " ");

  await user.click(screen.getByRole("button", { name: "save" }));
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByText("legacyError")).toBeInTheDocument();
});

it("opens the preview in a sheet from the body card", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t1" />);
  const bodyCard = screen.getByRole("region", { name: "bodyTitle" });
  const button = within(bodyCard).getByRole("button", { name: "previewLabel" });
  // Under the card's title and hint, not beside them: as the section's
  // aside it squeezed the hint into a narrow column on a phone.
  const heading = within(bodyCard).getByRole("heading", { name: "bodyTitle" });
  expect(heading.parentElement?.parentElement?.contains(button)).toBe(false);
  await user.click(button);
  const sheet = screen.getByRole("dialog", { name: "previewLabel" });
  expect(within(sheet).getByTitle("previewLabel")).toBeInTheDocument();
});

it("shows the create button on a new template before anything is typed", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView />);
  expect(screen.getByText("createPending")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();

  // "Batal" leaves for the list instead of only clearing the fields.
  const [cancel] = screen.getAllByRole("button", { name: "cancel" });
  if (cancel) await user.click(cancel);
  await vi.waitFor(() => {
    expect(push).toHaveBeenCalledWith("/settings/document-templates");
  });
});

// docs/07-ui-ux.md, Form: an incomplete submit marks every missing field
// and focuses the first one.
it("marks the missing name and body on an empty create and focuses the name", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView />);
  await user.click(screen.getByRole("button", { name: "create" }));

  const name = screen.getByRole("textbox", { name: /nameLabel/ });
  const body = screen.getByRole("textbox", { name: /bodyLabel/ });
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(body).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("nameRequired")).toBeInTheDocument();
  expect(screen.getByText("bodyRequired")).toBeInTheDocument();
  expect(name).toHaveFocus();
});

it("keeps the format toolbar on one sideways-scrolling row on a phone", () => {
  render(<TemplateEditorView templateId="t1" />);
  const toolbar = screen.getByRole("toolbar", { name: "toolbarLabel" });
  expect(toolbar).toHaveClass("overflow-x-auto", "sm:flex-wrap");
  expect(toolbar).not.toHaveClass("flex-wrap");
});

it("draws the preview frame on white paper with a light colour scheme", async () => {
  const user = userEvent.setup();
  render(<TemplateEditorView templateId="t1" />);
  await user.click(screen.getByRole("button", { name: "previewLabel" }));
  const sheet = screen.getByRole("dialog", { name: "previewLabel" });
  expect(within(sheet).getByTitle("previewLabel")).toHaveClass("bg-paper", "scheme-light");
});

it("says so when the template does not exist", () => {
  render(<TemplateEditorView templateId="missing" />);
  expect(screen.getByText("editor.notFoundTitle")).toBeInTheDocument();
});
