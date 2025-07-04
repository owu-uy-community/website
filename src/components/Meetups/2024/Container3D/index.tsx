"use client";
import Atropos from "atropos/react";

export function Container3D({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-50 mx-auto h-auto w-full md:aspect-[2/1]">
      <div className="isolate h-full opacity-100 md:aspect-[2/1]">
        <div className="h-full">
          <Atropos
            className="mx-auto block h-auto w-full shadow-2xl [box-sizing:border-box] md:aspect-[2/1]"
            highlight={false}
            innerClassName="backdrop-blur-xl rounded-[30px]"
          >
            {children}
          </Atropos>
        </div>
      </div>
    </div>
  );
}
