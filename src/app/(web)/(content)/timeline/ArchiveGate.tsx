"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { returnPending, useNear } from "./archive-data";

function Placeholder() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <div className="h-14 rounded-2xl bg-white/[0.03]" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-16 rounded-xl bg-white/[0.03]" />
      ))}
    </div>
  );
}

// The archive's code (filters, list, reading panel) loads as the reader nears it, not with the
// page: it sits far below the fold, and its chunks used to download before the first paint
const Archive = dynamic(() => import("./Archive"), { ssr: false, loading: Placeholder });

const ANCHOR = /^#(anio-|archivo)/;

/** Mounts the archive when it gets close, or right away for a link into it (a year, an event, filters, a way back) */
export default function ArchiveGate() {
  const [ref, near] = useNear<HTMLDivElement>("1500px");
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (ANCHOR.test(location.hash) || location.search || returnPending()) setLinked(true);
    const onHash = () => ANCHOR.test(location.hash) && setLinked(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return <div ref={ref}>{near || linked ? <Archive /> : <Placeholder />}</div>;
}
