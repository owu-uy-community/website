"use client";

import * as React from "react";

/**
 * OWU logo positioned in bottom-right corner with rotation
 */
export const LogoCorner: React.FC = () => {
  return (
    <div className="absolute -bottom-2 right-0 z-20 max-w-[200px] -rotate-12 sm:-bottom-3 md:-bottom-5">
      <img src="/images/logos/owu.png" alt="OWU" className="h-16 w-auto object-contain sm:h-24 md:h-32 lg:h-40" />
    </div>
  );
};

LogoCorner.displayName = "LogoCorner";

