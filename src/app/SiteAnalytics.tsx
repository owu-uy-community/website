"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import Script from "next/script";

import { EXTERNAL_SERVICES } from "./lib/constants";

/**
 * Analytics for the pages people visit. The wall (`/owy/stage`, also inside the scenes desk's two
 * monitors and every OBS browser source) is a screen, not a visit: it skips them, which spares
 * the desk three copies of the scripts and keeps them out of the page-view counts.
 */
export function SiteAnalytics() {
  const pathname = usePathname();
  if (pathname?.startsWith("/owy/stage")) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
      {/* Google Analytics waits for the browser to go idle, so its ~180 KB never competes with the page */}
      <Script async src={EXTERNAL_SERVICES.googleTagManager} strategy="lazyOnload" />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-RVTWHW4J21');
        `}
      </Script>
    </>
  );
}
