"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HEADER_ACTIONS_ID = "admin-header-actions";

/**
 * Renders a page's own controls in the admin header, right of the
 * breadcrumbs, so a live page doesn't spend a row of its height on a toolbar.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => setSlot(document.getElementById(HEADER_ACTIONS_ID)), []);

  return slot ? createPortal(children, slot) : null;
}
