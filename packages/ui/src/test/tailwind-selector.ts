import { compile } from "tailwindcss";

/**
 * Compiles one utility class with Tailwind itself and returns the selector
 * of the rule it produces, so a test can ask jsdom whether an element in a
 * real tree would match it (`element.matches(selector)`). Variants such as
 * `group-data-[state=open]/trigger:` or `has-[...]` decide which ancestor
 * or descendant counts, and only the compiled selector shows that.
 */
export async function compiledSelector(className: string): Promise<string> {
  const compiler = await compile("@tailwind utilities;");
  const css = compiler.build([className]).replace(/\/\*[\s\S]*?\*\//g, "");
  const selector = css.slice(0, css.indexOf("{")).trim();
  if (selector === "") throw new Error(`Tailwind produced no rule for "${className}"`);
  return selector;
}
