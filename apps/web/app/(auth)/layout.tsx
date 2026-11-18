"use client";

import { UiLinkProvider } from "@newsekolah/ui";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { AuthBrandPanel } from "../../features/auth/components/auth-brand-panel";

/**
 * Frame shared by every /(auth) page (sign in, forgot and reset password,
 * forced password change). The school's brand panel is a compact band on
 * a phone, with the page rising over it as a sheet, and the left pane from
 * 1024px, with the page's card anchored at the same height on every page
 * so nothing jumps when moving between them.
 */
export default function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <UiLinkProvider component={Link}>
      <div className="flex min-h-dvh flex-col bg-surface lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:bg-bg">
        <AuthBrandPanel />
        <main
          id="main-content"
          className="relative z-10 -mt-6 flex flex-1 flex-col rounded-t-xl bg-surface px-5 pb-10 pt-8 sm:px-8 lg:mt-0 lg:rounded-none lg:bg-bg lg:px-12 lg:pb-12 lg:pt-[max(3rem,14vh)]"
        >
          <div className="mx-auto flex w-full max-w-md flex-col">{children}</div>
        </main>
      </div>
    </UiLinkProvider>
  );
}
