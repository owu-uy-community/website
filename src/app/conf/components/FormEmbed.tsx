import classNames from "classnames";

import Reveal from "./Reveal";

type FormEmbedProps = {
  src: string;
  title: string;
  /** Iframe height per breakpoint; see note below on why it must be fixed */
  heightClassName?: string;
};

/**
 * Google Forms ships white and cannot be themed from outside. `invert(1)` turns it dark and
 * `hue-rotate` restores the accent hues. No frames of our own: the form brings its own card
 * and margins, so any border we add sits visibly misaligned.
 *
 * Fixed heights: a cross-origin iframe cannot be measured, so there is no autosize. The form
 * reflows taller on mobile. Overshooting is safe (the leftover inverts to black on black);
 * undershooting adds an inner scrollbar.
 */
export default function FormEmbed({ src, title, heightClassName = "h-[3400px] sm:h-[2680px]" }: FormEmbedProps) {
  return (
    <Reveal amount={0.05} className="w-full" delay={0.15} y={30}>
      <div style={{ filter: "invert(1)" }}>
        <div style={{ filter: "hue-rotate(180deg)" }}>
          <iframe className={classNames("w-full", heightClassName)} src={src} title={title}>
            Cargando…
          </iframe>
        </div>
      </div>
    </Reveal>
  );
}
