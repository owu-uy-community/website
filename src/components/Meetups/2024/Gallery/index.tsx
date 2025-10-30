"use client";

import Autoplay from "embla-carousel-autoplay";
import Link from "next/link";

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "components/shared/ui/carousel";
import { addUtmParams } from "app/lib/utils";
import { EXTERNAL_PLATFORMS } from "app/lib/constants";

type GalleryProps = {
  gallery?: readonly {
    readonly id: string;
    readonly url: string;
    readonly alt: string;
  }[];
};

export default function Gallery({ gallery }: GalleryProps) {
  return (
    <div className="flex w-full max-w-[1200px] flex-col items-center justify-center gap-5" id="galeria">
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">Galería</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">
          ¡Reviví los mejores momentos de La Meetup 2024!
        </p>
      </span>

      <Carousel
        className="min-w-full"
        plugins={[
          Autoplay({
            delay: 5000,
          }),
        ]}
      >
        <CarouselContent className="relative">
          {gallery?.map(({ id, url, alt }) => (
            <CarouselItem key={id}>
              <img
                alt={alt}
                className="mx-auto h-[200px] w-full rounded-md object-contain md:h-[600px]"
                loading="eager"
                src={url}
              />
            </CarouselItem>
          ))}
        </CarouselContent>

        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <Link
        className="inline-flex w-full max-w-[180px] skew-x-[-21deg] cursor-pointer items-center justify-center self-center border-2 border-yellow-400 px-5 py-2.5 text-base font-semibold uppercase text-white ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-yellow-400 hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out md:max-w-[280px]"
        href={addUtmParams(EXTERNAL_PLATFORMS.linkedin.posts)}
        target="_blank"
      >
        <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">¡VER MÁS!</span>
      </Link>
    </div>
  );
}
