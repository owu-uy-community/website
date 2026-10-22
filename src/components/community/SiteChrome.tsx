import { CommandPaletteProvider } from "components/community/CommandPalette";
import { MotionRoot } from "components/community/motion";
import Starfield from "components/community/Starfield";
import Navbar from "components/shared/Navbar";

/** owu.uy's public frame: the warm light, the stars, the navbar and the ⌘K palette. */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="owu-site relative flex min-h-screen w-full flex-col">
      {/* The warm light at the top of every page, from the very edge so the navbar sits inside it */}
      <div aria-hidden className="owu-furnace pointer-events-none absolute inset-x-0 top-0 z-0 h-[560px]" />
      <Starfield />
      <MotionRoot>
        <CommandPaletteProvider>
          <Navbar />
          <div className="relative z-20 flex w-full max-w-screen flex-1 flex-col">{children}</div>
        </CommandPaletteProvider>
      </MotionRoot>
    </div>
  );
}
