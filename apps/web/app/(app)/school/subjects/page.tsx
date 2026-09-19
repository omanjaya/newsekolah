import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/school/learning?tab=subjects");
}
