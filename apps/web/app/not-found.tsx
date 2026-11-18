"use client";

import type { ReactElement } from "react";

import { NotFoundState } from "../components/not-found-state";
import { PublicSiteFrame } from "../components/public-site-frame";

/** Any address no route matches, signed in or not: the 404 state in the school's frame. */
export default function NotFound(): ReactElement {
  return (
    <PublicSiteFrame>
      <NotFoundState />
    </PublicSiteFrame>
  );
}
