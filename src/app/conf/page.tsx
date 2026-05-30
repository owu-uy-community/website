import type { Metadata } from "next";

import GeometryField from "./GeometryField";
import RebrandReveal from "./RebrandReveal";

export const metadata: Metadata = {
  title: "OWU CONF",
  description: null,
  alternates: { canonical: null },
  openGraph: undefined,
  twitter: undefined,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function ConfComingSoonPage() {
  return (
    <main className="relative isolate flex min-h-[100svh] w-full flex-col items-center justify-center overflow-hidden bg-black px-6 py-24 text-center text-white">
      <GeometryField />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_58%_at_50%_50%,rgba(0,0,0,0.78)_0%,transparent_80%)]"
      />

      <RebrandReveal />
    </main>
  );
}
