import { Button } from "components/shared/ui/button";
import { Megaphone, Search } from "lucide-react";
import Link from "next/link";

export default function CallForProposalsBanner() {
  // Check if current date is past the deadline (July 31, 2025)
  const now = new Date();
  const deadline = new Date("2025-07-31T23:59:59"); // TODO: Move to a constant

  if (now > deadline) {
    return null;
  }

  return (
    <section className="relative bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 py-3">
      <div className="mx-auto max-w-[1280px] px-4">
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black/10">
              <Megaphone className="h-6 w-6 text-black" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-balance text-sm font-bold text-black md:text-base">
                    ¡Call for Proposals Abierto!
                  </h3>
                  <p className="text-balance text-xs text-black/80 md:text-sm">
                    Primera vez que abrimos propuestas para charlas. <strong>Fecha límite: 31 de Julio</strong>
                  </p>
                </div>
                <Link href="/la-meetup/#call-for-proposals" className="hidden lg:block">
                  <Button size="sm" className="whitespace-nowrap bg-black font-semibold text-white hover:bg-gray-800">
                    <Search className="mr-1.5 h-4 w-4" strokeWidth={2} />
                    Quiero saber más
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
