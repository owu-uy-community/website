import type { Metadata } from "next";

import ConfLanding from "./ConfLanding";

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

export default function ConfPage() {
  return (
    <main className="min-h-[100dvh] overflow-x-clip bg-black">
      <ConfLanding />
    </main>
  );
}
