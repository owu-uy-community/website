"use client";

import classNames from "classnames";
import Link from "next/link";
import { useCallback, useState } from "react";

import { INTERNAL_ROUTES } from "app/lib/constants";

import Lightbox, { openWithMorph, withViewTransition, type LightboxPhoto } from "./Lightbox";
import OpenSpaceScene, { type OpenSpaceSceneName } from "./OpenSpaceScenes";
import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";

type Step = {
  scene: OpenSpaceSceneName;
  label: string;
  headline: string;
  body: string;
};

/* The four stages, as OWU has run them since 2023. */
const STEPS: Step[] = [
  {
    scene: "apertura",
    label: "Apertura",
    headline: "Se explica cómo funciona",
    body: "Nadie llega sabiendo la mecánica, así que se arranca por ahí: se cuenta la dinámica, se presentan las salas y se abre el mercado de ideas. Diez minutos y ya estás adentro.",
  },
  {
    scene: "mercado",
    label: "Mercado de ideas",
    headline: "Proponés tu tema en una card",
    body: "Lo escribís, lo contás en 30 segundos y colgás la card en la grilla eligiendo sala y horario. No hace falta ser experto: puede ser una charla, una pregunta abierta, un debate, una demo o un “quiero aprender sobre X, ¿alguien me cuenta?”.",
  },
  {
    scene: "sesiones",
    label: "Sesiones",
    headline: "Varias salas, todas a la vez",
    body: "Bloques de ~25 minutos de conversación y 5 para cambiar de sala. Elegís a dónde entrar mirando la grilla, que va cambiando durante todo el día. Entre bloques hay coffee break para seguir la charla de pasillo.",
  },
  {
    scene: "clausura",
    label: "Clausura",
    headline: "Se cierra entre todos",
    body: "Cuando terminan las sesiones el grupo se vuelve a juntar. Se comparte lo que pasó en cada sala y se cierra el espacio con la misma gente que lo armó.",
  },
];

/* The four principles of Open Space, in the words the facilitator actually uses. */
const RULES = [
  { title: "Quienes están son las personas correctas", body: "No falta nadie. La conversación se arma con quien apareció." },
  { title: "Lo que pase es lo único que podía pasar", body: "No hay una versión ideal de la sesión que te estés perdiendo." },
  { title: "Empieza cuando empieza, termina cuando termina", body: "La conversación manda, no el reloj." },
];

const PHOTO_BASE = "/images/2024/openspace/la-meetup/openspaceGallery";

const PHOTOS: LightboxPhoto[] = [
  { src: `${PHOTO_BASE}/0/image.webp`, alt: "Una sesión del open space con la card del tema apoyada sobre la mesa del centro" },
  { src: `${PHOTO_BASE}/9/image.webp`, alt: "Alguien proponiendo su tema con el micrófono mientras otra persona escribe la card" },
  { src: `${PHOTO_BASE}/2/image.webp`, alt: "La facilitación del open space frente a la sala, con el temporizador del bloque en pantalla" },
  { src: `${PHOTO_BASE}/3/image.webp`, alt: "Una ronda de veinte personas conversando junto a los ventanales" },
  { src: `${PHOTO_BASE}/1/image.webp`, alt: "Una sesión con demo en pantalla y el público sentado alrededor" },
  { src: `${PHOTO_BASE}/4/image.webp`, alt: "Una ronda de sillas en plena conversación, con el bloque corriendo en la pantalla del fondo" },
  { src: `${PHOTO_BASE}/7/image.webp`, alt: "Una sesión frente al mural geométrico, con alguien pidiendo la palabra" },
  { src: `${PHOTO_BASE}/5/image.webp`, alt: "Una sala llena escuchando a quien propuso el tema" },
  { src: `${PHOTO_BASE}/8/image.webp`, alt: "Una sesión con TV, presentada de pie frente a la gente sentada en sillones" },
  { src: `${PHOTO_BASE}/6/image.webp`, alt: "La apertura del open space, con la sala de pie escuchando la consigna" },
];

function StepNumber({ index, active }: { index: number; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "font-display text-sm font-bold leading-none tabular-nums transition-colors",
        active ? "text-[#F5BB03]" : "text-[#FBF5E7]/40"
      )}
    >
      0{index + 1}
    </span>
  );
}

export default function OpenSpace() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);

  const active = STEPS[step];

  const openLightbox = useCallback((index: number, thumb: HTMLImageElement | null) => {
    openWithMorph(thumb, () => setPhoto(index));
  }, []);

  const closeLightbox = useCallback(() => {
    withViewTransition(() => setPhoto(null));
  }, []);

  const stepPhoto = useCallback((delta: number) => {
    withViewTransition(() => {
      setPhoto((current) => (current === null ? current : (current + delta + PHOTOS.length) % PHOTOS.length));
    });
  }, []);

  return (
    <section className="mt-16 w-full scroll-mt-24 sm:mt-24" id="open-space">
      <div className="mx-auto w-full max-w-[1440px] px-8">
        <SectionHeader
          eyebrow="EL CORAZÓN DE LA CONF"
          title={
            <>
              LA AGENDA <span className="text-[#F5BB03]">LA HACÉS VOS</span>
            </>
          }
        />

        <Reveal delay={0.12} y={22}>
          <p className="mt-6 max-w-[660px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
            Media jornada de OWU CONF no tiene agenda hasta que llegás. Se llama{" "}
            <strong className="font-semibold text-[#FBF5E7]">open space</strong> y funciona así: las charlas las
            proponen las personas que están en la sala, el mismo día, y la grilla se arma en vivo.
          </p>
        </Reveal>

        {/* Steps: pick one on the left, read it on the right. */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-14">
          <Reveal y={24}>
            <ol className="flex flex-col">
              {STEPS.map((entry, index) => {
                const isActive = index === step;

                return (
                  <li key={entry.scene}>
                    <button
                      aria-current={isActive || undefined}
                      className={classNames(
                        "group flex w-full items-center gap-4 border-l-2 py-4 pl-5 pr-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]",
                        isActive ? "border-[#F5BB03] bg-[#FBF5E7]/[0.04]" : "border-[#FBF5E7]/15 hover:bg-[#FBF5E7]/[0.02]"
                      )}
                      type="button"
                      onClick={() => setStep(index)}
                    >
                      <StepNumber active={isActive} index={index} />
                      <OpenSpaceScene
                        className={classNames(
                          "h-11 w-14 shrink-0 transition-opacity",
                          isActive ? "opacity-100" : "opacity-45 group-hover:opacity-75"
                        )}
                        name={entry.scene}
                      />
                      <span
                        className={classNames(
                          "font-display text-lg font-extrabold uppercase leading-none tracking-[-0.01em] transition-colors",
                          isActive ? "text-[#FBF5E7]" : "text-[#FBF5E7]/55 group-hover:text-[#FBF5E7]/80"
                        )}
                      >
                        {entry.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Reveal>

          <Reveal delay={0.1} y={24}>
            {/* key restarts the fade whenever the selected step changes */}
            <div
              key={active.scene}
              className="flex h-full animate-[fade-up_0.35s_cubic-bezier(0.2,0.7,0.2,1)_forwards] flex-col justify-center gap-6 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03] p-8 sm:flex-row sm:items-center sm:gap-10 sm:p-10"
            >
              <OpenSpaceScene className="h-36 w-44 shrink-0 self-center sm:h-44 sm:w-56" name={active.scene} />
              <div>
                <p className="font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-[#FBF5E7] sm:text-3xl">
                  {active.headline}
                </p>
                <p className="mt-4 text-pretty text-base leading-relaxed text-[#FBF5E7]/85 sm:text-lg">{active.body}</p>
              </div>
            </div>
          </Reveal>
        </div>

        {/* The two-feet law gets its own block: it is the rule newcomers never expect. */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-14">
          <Reveal y={24}>
            <p className="font-display text-sm font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/70">
              LAS REGLAS DE ORO
            </p>
            <ul className="mt-6 grid gap-px bg-[#FBF5E7]/12 sm:grid-cols-3">
              {RULES.map(({ title, body }) => (
                <li key={title} className="bg-black p-5">
                  <p className="font-display text-base font-extrabold uppercase leading-tight tracking-[-0.01em] text-[#FBF5E7]">
                    {title}
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#FBF5E7]/70">{body}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} y={24}>
            <div className="flex h-full items-center gap-6 bg-[#F5BB03] p-6 sm:p-8">
              <OpenSpaceScene className="h-24 w-28 shrink-0" name="dosPies" />
              <div>
                <p className="font-display text-xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-black sm:text-2xl">
                  La ley de los dos pies
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-black/75 sm:text-base">
                  Si donde estás no estás aportando ni aprendiendo, usá los dos pies y andá a otra sala. No es mala
                  educación: es el sistema funcionando.
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15} y={20}>
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link
              className="inline-flex items-center gap-2 bg-[#FBF5E7] px-6 py-3.5 font-display text-sm font-bold uppercase leading-none text-black transition-colors hover:bg-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
              href={INTERNAL_ROUTES.conf.openspace}
            >
              Ver la grilla en vivo
              <span aria-hidden="true">→</span>
            </Link>
            <p className="max-w-[420px] text-sm leading-relaxed text-[#FBF5E7]/60">
              El día del evento esta misma página muestra qué se está hablando en cada sala, en tiempo real.
            </p>
          </div>
        </Reveal>
      </div>

      {/* Proof: this is what it actually looks like. */}
      <Reveal amount={0.2} className="mt-12" delay={0.1} duration={0.9} y={26}>
        <div className="flex snap-x snap-mandatory gap-1 overflow-x-auto px-8 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PHOTOS.map(({ src, alt }, index) => (
            <button
              key={src}
              aria-label={`Ampliar foto: ${alt}`}
              className="group/item relative shrink-0 snap-start cursor-zoom-in overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
              type="button"
              onClick={(event) => openLightbox(index, event.currentTarget.querySelector("img"))}
            >
              <img
                alt={alt}
                className="h-[180px] w-auto object-cover transition-transform duration-500 ease-out group-hover/item:scale-105 sm:h-[220px] min-[1440px]:h-[260px]"
                loading="lazy"
                src={src}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/item:opacity-100"
              />
            </button>
          ))}
        </div>
      </Reveal>

      <Lightbox
        downloadPrefix="owu-open-space"
        index={photo}
        photos={PHOTOS}
        onClose={closeLightbox}
        onStep={stepPhoto}
      />
    </section>
  );
}
