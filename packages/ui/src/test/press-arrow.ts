import userEvent from "@testing-library/user-event";

/**
 * Radix radio groups move roving focus in a timeout after keydown and check
 * the radio only if the arrow key is still down when focus lands, as it is
 * for a person. userEvent releases instantly, so hold the key across the
 * timeout.
 */
export async function pressArrow(
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
): Promise<void> {
  await userEvent.keyboard(`{${key}>}`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await userEvent.keyboard(`{/${key}}`);
}
