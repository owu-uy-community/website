import Navbar from "components/shared/Navbar/lazy";

import NotFound from "./(web)/(content)/not-found";

/**
 * Unmatched URLs land here (route-group layouts don't apply), so this wraps the
 * community site's 404 in its chrome by hand. The search box is inert: the ⌘K
 * palette only exists inside the content layout.
 */
export default function RootNotFound() {
  return (
    <div className="owu-site relative flex min-h-screen w-full flex-col">
      <div aria-hidden className="owu-furnace pointer-events-none absolute inset-x-0 top-0 z-0 h-[560px]" />
      <Navbar />
      <div className="relative z-20 flex w-full flex-1 flex-col">
        <NotFound />
      </div>
    </div>
  );
}
