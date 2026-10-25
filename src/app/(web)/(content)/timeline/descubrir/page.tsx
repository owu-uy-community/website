import { pageMetadata } from "lib/community/metadata";

import DeckGate from "./DeckGate";

export const metadata = pageMetadata({
  title: "Descubrí la historia de la comunidad tech uruguaya",
  description:
    "Los eventos de las comunidades tech de Uruguay de a uno, con sus fotos: deslizá para pasar al siguiente y tocá para ver el evento completo.",
  path: "/timeline/descubrir",
});

/**
 * The history as a deck of cards, one event at a time; it fills the screen under the navbar. A thrown
 * card flies past the screen's edge, so the page clips it: otherwise it grows a scrollbar mid-throw.
 */
export default function DiscoverPage() {
  return (
    <main className="h-[calc(100dvh-4rem)] overflow-clip lg:h-[calc(100dvh-72px)]">
      <h1 className="sr-only">Descubrí la historia, evento por evento</h1>
      <DeckGate />
    </main>
  );
}
