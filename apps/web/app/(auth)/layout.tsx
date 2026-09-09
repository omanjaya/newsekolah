"use client";

import type { ReactElement, ReactNode } from "react";

import { TenantBrand } from "../../components/tenant-brand";

/**
 * Shared centered-card frame for /login and /change-password. DESIGN.md
 * allows ENERGY 3 for public pages, but the login screen here stays plain:
 * no tenant photo asset exists yet in the branding contract to use for it.
 */
export default function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-sm border border-border bg-surface p-8">
        <div className="mb-6 flex justify-center">
          <TenantBrand />
        </div>
        {children}
      </div>
    </div>
  );
}
