/** Joins conditional className fragments. Deliberately not `clsx`/`cva`: the
 * component set here is small enough that a one-line join keeps one fewer
 * dependency in a workspace that already pulls in a lot of native modules. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
