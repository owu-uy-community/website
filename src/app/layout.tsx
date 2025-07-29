import type { Metadata } from "next";

import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { EXTERNAL_SERVICES } from "./lib/constants";
const inter = Inter({ subsets: ["latin"] });

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
      <meta content="/la_meetup_2024.png" property="og:image" />
      <meta content="summary_large_image" property="twitter:card" />
      <meta content="/la_meetup_2024.png" property="twitter:image" />
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
