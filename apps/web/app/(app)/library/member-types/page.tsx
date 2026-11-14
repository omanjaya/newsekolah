import { redirect } from "next/navigation";

/** Member types live in the library settings hub; old links land on that section. */
export default function Page(): never {
  redirect("/library/settings?section=memberTypes");
}
