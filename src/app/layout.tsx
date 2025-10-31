import type { Metadata } from "next";

import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { TicketReleaseProvider } from "contexts/TicketReleaseContext";
import { QueryProvider } from "components/providers/QueryProvider";
import { Toaster } from "components/shared/ui/sonner";
import { EXTERNAL_SERVICES } from "./lib/constants";

export const metadata: Metadata = {
  description: "Únete a nuestra comunidad de desarrolladores.",
  title: "OWU | Comunidad TI de Uruguay",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <meta charSet="utf-8" />
      <meta content="website" property="og:type" />
      <meta content="/images/events/la_meetup_2024.png" property="og:image" />
      <meta content="summary_large_image" property="twitter:card" />
      <meta content="/images/events/la_meetup_2024.png" property="twitter:image" />
      <Analytics />
      <SpeedInsights />
      <Script async src={EXTERNAL_SERVICES.googleTagManager} />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-RVTWHW4J21');
        `}
      </Script>
      <body>
        <QueryProvider>
          <TicketReleaseProvider>{children}</TicketReleaseProvider>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
