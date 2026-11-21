"use client";

import dynamic from "next/dynamic";

export function Frame() {
  return <div aria-busy className="h-[72vh] min-h-[28rem] animate-pulse rounded-2xl bg-white/[0.03]" />;
}

// Client-only: sigma draws with WebGL, and the network loads after the page
const Network = dynamic(() => import("./Network"), { ssr: false, loading: Frame });

export default function NetworkGate() {
  return <Network />;
}
