"use client";

import { useEffect } from "react";

import { composeDocumentTitle } from "./page-title-format";

/**
 * The browser tab title, "<page> · <school>" (audit shell-auth-public-10:
 * every tab used to read just the school name). Two writers own one half
 * each: the tenant provider the school name, the page template the page
 * name. Keeping both halves here means the order their effects run in
 * (a child's effect runs before its ancestor's) cannot let one overwrite
 * the other.
 */
let schoolName = "";
let pageTitle: string | null = null;

function apply(): void {
  if (typeof document === "undefined") return;
  const next = composeDocumentTitle(pageTitle, schoolName);
  if (next && document.title !== next) document.title = next;
}

/** The tenant provider reports the school's name (or the product fallback). */
export function setDocumentSchoolName(name: string): void {
  schoolName = name;
  apply();
}

/** A page reports its own name; `null` when it leaves (the tab then reads the school name). */
export function setDocumentPageTitle(title: string | null): void {
  pageTitle = title;
  apply();
}

/**
 * Names the browser tab after the current page while it is mounted. A page
 * that unmounts clears only its own title, so the next page's title (whose
 * effect may already have run) is never wiped.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const own = title?.trim() ? title.trim() : null;
    setDocumentPageTitle(own);
    return () => {
      if (pageTitle === own) setDocumentPageTitle(null);
    };
  }, [title]);
}
