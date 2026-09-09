import type { AxeResults } from "axe-core";
import { expect } from "vitest";
import { axe } from "vitest-axe";

/**
 * vitest-axe@0.1.0's `toHaveNoViolations` type augmentation targets a
 * single-type-parameter `Vi.Assertion<T>`, but Vitest 5's `Assertion` takes
 * two; the interfaces no longer merge, so TypeScript doesn't see the
 * matcher even though it is registered at runtime (see ./setup.ts). This
 * helper isolates the one unavoidable cast instead of scattering it across
 * every a11y test.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results: AxeResults = await axe(container);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- see doc comment above
  (expect(results) as any).toHaveNoViolations();
}
