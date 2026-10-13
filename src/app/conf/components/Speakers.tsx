import { TALKS } from "../talks";

import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";
import { PersonCard } from "./Team";

/* One row per talk: its speakers on the left, title and abstract on the right; stacked on mobile */
export default function Speakers() {
  return (
    <section className="mx-auto mt-[29px] w-full max-w-[1440px] scroll-mt-24 px-8 pt-[37px]" id="speakers">
      <SectionHeader eyebrow="CHARLAS" title="SPEAKERS" />

      <div className="mt-12 flex flex-col gap-20 lg:gap-24">
        {TALKS.map(({ title, description, outline, speakers }) => (
          <article key={title} className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <ul className="flex justify-center gap-6">
              {speakers.map(({ name, picture, role, linkedin }, i) => (
                <li key={name} className="w-full max-w-[240px] flex-1">
                  <Reveal amount={0.3} delay={i * 0.09} scale={0.93} y={34}>
                    <PersonCard
                      linkedin={linkedin}
                      name={name}
                      picture={picture}
                      placement="speakers-linkedin"
                      role={role}
                    />
                  </Reveal>
                </li>
              ))}
            </ul>

            <div>
              <Reveal delay={0.1} y={26}>
                <h3 className="font-display text-2xl leading-[1.1] font-extrabold tracking-[-0.02em] text-balance text-[#F5BB03] uppercase min-[1440px]:text-4xl sm:text-3xl">
                  {title}
                </h3>
              </Reveal>
              {description.map((paragraph, i) => (
                <Reveal key={i} delay={0.18 + i * 0.08} y={20}>
                  <p className="mt-5 max-w-[680px] text-lg leading-relaxed text-pretty text-[#FBF5E7]/90">
                    {paragraph}
                  </p>
                </Reveal>
              ))}
              {outline && (
                <ol className="mt-8 grid max-w-[760px] gap-8 sm:grid-cols-3 sm:gap-6">
                  {outline.map((part, i) => (
                    <li key={part.title}>
                      <Reveal delay={0.26 + i * 0.08} y={20}>
                        <p className="font-display text-xs font-semibold tracking-[0.18em] text-[#F5BB03] uppercase">
                          Parte {i + 1}
                        </p>
                        <p className="mt-2 font-display text-lg leading-snug font-bold text-[#FBF5E7]">{part.title}</p>
                        <ul className="mt-3 space-y-2">
                          {part.items.map((item) => (
                            <li
                              key={item}
                              className="relative pl-4 text-[15px] leading-snug text-pretty text-[#FBF5E7]/75 before:absolute before:top-[0.55em] before:left-0 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#F5BB03]"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </Reveal>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
