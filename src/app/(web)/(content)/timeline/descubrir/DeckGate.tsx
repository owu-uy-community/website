"use client";

import dynamic from "next/dynamic";

function Frame() {
  return (
    <div aria-busy className="mx-auto flex h-full w-full max-w-md flex-col px-4 pt-3 pb-4">
      <div className="h-9" />
      <div className="mt-3 min-h-0 flex-1 animate-pulse rounded-3xl bg-white/[0.05]" />
      <div className="mt-4 h-14" />
      <div className="mt-3 h-4" />
    </div>
  );
}

// Client-only: the deck reads the URL (its filters) and the archive's rows, so the server draws
// the frame it will fill, at the same size
const Deck = dynamic(() => import("./Deck"), { ssr: false, loading: Frame });

export default function DeckGate() {
  return <Deck />;
}
