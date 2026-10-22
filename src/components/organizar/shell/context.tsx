"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useParams } from "next/navigation";

import type { MyCommunity } from "lib/orpc/communities/schemas";

export type PanelCommunity = Pick<MyCommunity, "id" | "slug" | "name" | "logoUrl" | "role">;

type PanelState = {
  /** The communities this person organizes (site staff: every active one). */
  communities: PanelCommunity[];
  isStaff: boolean;
};

const PanelContext = createContext<PanelState>({ communities: [], isStaff: false });

export function PanelProvider({ value, children }: { value: PanelState; children: ReactNode }) {
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

/** The panel's communities, and the one in the URL (null on pages outside a community). */
export function usePanel() {
  const state = useContext(PanelContext);
  const params = useParams<{ communitySlug?: string }>();
  const current = state.communities.find((community) => community.slug === params.communitySlug) ?? null;

  return { ...state, current };
}
