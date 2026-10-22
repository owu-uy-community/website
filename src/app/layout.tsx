import type { Metadata } from "next";

import "./globals.css";
import { QueryProvider } from "components/providers/QueryProvider";
import { Toaster } from "components/shared/ui/sonner";
import { fontVariables } from "./fonts";
import { SiteAnalytics } from "./SiteAnalytics";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.owu.uy"),
  description: "Únete a nuestra comunidad de desarrolladores.",
  title: "OWU | Comunidad TI de Uruguay",
  openGraph: {
    type: "website",
    images: ["/images/events/la_meetup_2024.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/images/events/la_meetup_2024.png"],
  },
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
      <SiteAnalytics />
      <body>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
