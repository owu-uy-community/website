import type { Metadata } from "next";
import { Suspense } from "react";

import "./globals.css";
import { fontVariables } from "./fonts";
import { SiteAnalytics } from "./SiteAnalytics";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.owu.uy"),
  description: "Únete a nuestra comunidad de desarrolladores.",
  title: "OWU | Comunidad TI de Uruguay",
  // The image is ./opengraph-image.tsx; Twitter falls back to it
  openGraph: { type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Smooth in-page scrolling (anchors, the settings index), but a new page starts at the top
    // instead of gliding there from wherever the last one was scrolled.
    <html className={fontVariables} data-scroll-behavior="smooth" lang="es">
      <body>
        {/* It reads the pathname, which a prerendered shell doesn't know yet: the scripts stream in */}
        <Suspense>
          <SiteAnalytics />
        </Suspense>
        {/* React Query and the toaster live in the layouts that use them (components/providers/AppProviders) */}
        {children}
      </body>
    </html>
  );
}
