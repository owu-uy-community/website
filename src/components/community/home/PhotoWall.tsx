import Image from "next/image";

import { cn } from "app/lib/utils";
import { Reveal } from "components/community/motion";

/*
 * The people, before anything else: a wall of photos from the last meetups.
 * One anchor shot of the crowd, then the moments that make a meetup a meetup.
 */

type Photo = { src: string; alt: string; caption: string; span: 3 | 4 | 6; className?: string };

const PHOTOS: Photo[] = [
  {
    src: "/images/conf/gallery/tangram-1.webp",
    alt: "Toda la sala de La Meetup III con los brazos en alto para la foto grupal",
    caption: "La Meetup III · Nov 2025",
    span: 6,
    className: "col-span-2 aspect-[16/10] lg:row-span-2",
  },
  {
    src: "/images/conf/gallery/momento-15.webp",
    alt: "Cuatro asistentes compartiendo una mesa y riéndose durante el after",
    caption: "El after",
    span: 3,
  },
  {
    src: "/images/2025/intro/4.webp",
    alt: "Una ronda de gente sentada en círculo armando la grilla del open space",
    caption: "Open space",
    span: 3,
  },
  {
    src: "/images/conf/gallery/tangram-4.webp",
    alt: "Tres asistentes brindando y riéndose entre charlas",
    caption: "Entre charlas",
    span: 3,
  },
  {
    src: "/images/2025/intro/5.webp",
    alt: "Una mano sosteniendo la credencial de La Meetup en la entrada",
    caption: "La entrada es gratis",
    span: 3,
  },
  {
    src: "/images/2025/intro/1.webp",
    alt: "Asistentes charlando en grupos en la entrada del venue antes de las charlas",
    caption: "Networking",
    span: 4,
  },
  {
    src: "/images/conf/gallery/tangram-6.webp",
    alt: "La mesa llena de stickers de las comunidades de OWU",
    caption: "Stickers",
    span: 4,
  },
  {
    src: "/images/conf/gallery/tangram-7.webp",
    alt: "El equipo organizador celebrando frente al cartel de La Meetup III",
    caption: "El equipo que lo hace posible",
    span: 4,
    className: "col-span-2 aspect-[16/9]",
  },
];

// The container is 1152px wide at most; each cell is a fraction of it on desktop
const SPAN = {
  3: { cell: "lg:col-span-3", sizes: "(min-width: 1152px) 288px, (min-width: 1024px) 25vw, 50vw" },
  4: { cell: "lg:col-span-4", sizes: "(min-width: 1152px) 384px, (min-width: 1024px) 33vw, 100vw" },
  6: { cell: "lg:col-span-6", sizes: "(min-width: 1152px) 576px, (min-width: 1024px) 50vw, 100vw" },
};

export default function PhotoWall({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-12 lg:auto-rows-[200px] xl:auto-rows-[224px]", className)}>
      {PHOTOS.map(({ src, alt, caption, span, className: cell }, index) => (
        <Reveal key={src} className={cn("aspect-[4/3] lg:aspect-auto", SPAN[span].cell, cell)} delay={index * 0.05}>
          <figure className="group relative h-full overflow-hidden rounded-2xl bg-white/[0.04]">
            <Image
              alt={alt}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
              fill
              sizes={SPAN[span].sizes}
              src={src}
            />
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/75 via-zinc-950/20 to-transparent px-4 pt-14 pb-3.5 text-[13px] font-medium text-white sm:text-sm">
              {caption}
            </figcaption>
          </figure>
        </Reveal>
      ))}
    </div>
  );
}
