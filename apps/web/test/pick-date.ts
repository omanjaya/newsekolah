import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Picks `date` ("YYYY-MM-DD") in the `DatePicker` labelled `label`, as a
 * user would: opens its calendar, pages month by month to the date and
 * clicks the day. Independent of the calendar's language and of the day
 * it opens on (the device's today or the current value).
 */
export async function pickDate(user: UserEvent, label: string, date: string): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: label }));
  const grid = await screen.findByRole("grid");
  for (let step = 0; step < 240; step += 1) {
    const cell = grid.ownerDocument.querySelector<HTMLElement>(
      `[role="gridcell"][data-date="${date}"]`,
    );
    if (cell) {
      await user.click(cell);
      return;
    }
    const focused = grid.ownerDocument.activeElement?.closest<HTMLElement>("[data-date]");
    const current = focused?.dataset.date ?? "";
    await user.keyboard(date < current ? "{PageUp}" : "{PageDown}");
  }
  throw new Error(`pickDate: ${date} never came into view`);
}
