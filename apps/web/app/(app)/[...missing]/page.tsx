import { notFound } from "next/navigation";

/**
 * Any address no other route claims lands here, inside the `(app)` layout,
 * so `(app)/not-found.tsx` answers it within the shell instead of the bare
 * root 404 (audit shell-auth-public-11). Real routes always win over a
 * catch-all; `(auth)` and `(public)` pages and the route handlers keep
 * their own addresses. A visitor without a session is sent to sign in
 * first, as on every `(app)` page, and sees the 404 after.
 */
export default function MissingPage(): never {
  notFound();
}
