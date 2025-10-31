import { FaRocket } from "react-icons/fa";
import Link from "next/link";

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "components/shared/ui/carousel";
import { RichText } from "components/shared/RichText";

type OpenSpaceProps = {
  title?: string;
  subtitle?: string;
  content?: string;
  primaryButtonName?: string;
  primaryButtonUrl?: string;
  gallery?: readonly {
    readonly id: string;
    readonly image: string;
    readonly alt: string;
  }[];
};

export default function OpenSpace({ content, primaryButtonName, primaryButtonUrl = "#", gallery }: OpenSpaceProps) {
  return (
    <div className="relative flex w-full flex-col items-center justify-center gap-8 rounded-2xl text-white xl:py-14">
      <span className="group flex flex-row items-center gap-3">
        <span className="flex flex-col items-center justify-center">
          <span className="flex flex-row items-center gap-4">
            <FaRocket className="hidden -rotate-180 text-4xl text-yellow-400 group-hover:mr-2 group-hover:text-yellow-500 md:flex" />
            <h2 className="text-center text-5xl font-bold text-yellow-400">Open Space</h2>
            <FaRocket className="hidden text-4xl text-yellow-400 group-hover:ml-2 group-hover:text-yellow-500 md:flex" />
          </span>
          <p className="mt-2 text-center text-lg font-[400] text-white">
            ¡Un espacio para compartir y aprender de manera colaborativa!
          </p>
        </span>
      </span>
      <div className="flex w-full flex-row flex-wrap justify-center gap-5 xl:justify-between">
        <div className="richtext flex w-full flex-col gap-3 xl:max-w-[550px]">
          <RichText content={content} />
        </div>
        <div className="flex w-full flex-col justify-center gap-3 xl:max-w-[550px]">
          <span className="text-2xl font-bold text-white">Galería</span>
          <span className="flex flex-col items-center justify-center">
            <Carousel className="max-h-[500px] w-full max-w-[900px]">
              <CarouselContent>
                {gallery?.length ? (
                  gallery.map(({ id, image, alt }) => (
                    <CarouselItem key={id}>
                      <img alt={alt} className="h-full max-h-[380px] w-full rounded-md object-cover" src={image} />
                    </CarouselItem>
                  ))
                ) : (
                  <CarouselItem>
                    <img alt="Not found" className="h-full max-h-[380px] w-full rounded-md" src="/images/events/placeholder.webp" />
                  </CarouselItem>
                )}
              </CarouselContent>
              <CarouselPrevious className="text-white" />
              <CarouselNext className="text-white" />
            </Carousel>
            <Link
              className="mt-4 inline-flex w-full max-w-[180px] skew-x-[-21deg] cursor-pointer items-center justify-center self-center border-2 border-yellow-400 px-5 py-2.5 text-base font-semibold uppercase text-white ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-yellow-400 hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out md:max-w-[280px]"
              href={primaryButtonUrl}
            >
              <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                {primaryButtonName}
              </span>
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
