"use client";

import { useQuery } from "@tanstack/react-query";

import { orpc } from "lib/orpc";

import type { NavViewer } from "./nav-config";

/** access.me, one query for the whole admin: platform roles and permissions, linked accounts. */
export const useAccessMe = () => useQuery(orpc.access.me.queryOptions({ staleTime: 60_000 }));

/**
 * Who the nav is drawn for; null until known, so site-staff items never flash for community staff.
 * Site staff hold `event:manage` on the platform (what shell.status calls `siteAdmin`).
 */
export function useNavViewer(): NavViewer | null {
  const me = useAccessMe().data;
  if (!me) return null;

  return { siteAdmin: me.permissions.includes("event:manage"), permissions: me.permissions };
}
