import SpeakerCard from "./SpeakerCard";
import ReactMarkdown from "react-markdown";

type Talk = {
  title: string;
  description: string;
  speakers: Array<{
    firstname: string;
    lastname: string;
    picture?: { url: string };
    jobTitle?: string;
    github?: string;
    linkedin?: string;
    x?: string;
  }>;
};

type SpeakersProps = {
  talks: Talk[];
};

export default function Speakers({ talks = [] }: SpeakersProps) {
  // Get all unique speakers from all talks
  const allSpeakers = talks.flatMap((talk) => talk.speakers);

  if (talks.length === 0 || allSpeakers.length === 0) {
    return null;
  }

  return (
    <section className="w-full max-w-[1280px] pt-16">
      <div className="mb-10 text-center">
        <h2 className="mb-4 text-center text-4xl font-bold text-white md:text-5xl">Speakers</h2>
        <p className="mb-10 mt-2 text-center text-lg font-[400] text-white">
          ¡Nuestros oradores que compartirán sus conocimientos!
        </p>
        <div className="mx-auto w-full overflow-hidden">
          <div className="animate-marquee flex">
            <p className="whitespace-nowrap pr-8 text-2xl font-black leading-relaxed text-yellow-400 md:text-4xl">
              {allSpeakers.map((s) => `${s.firstname.toUpperCase()} ${s.lastname.toUpperCase()}`).join(" · ")} ·
            </p>
            <p className="whitespace-nowrap pr-8 text-2xl font-black leading-relaxed text-yellow-400 md:text-4xl">
              {allSpeakers.map((s) => `${s.firstname.toUpperCase()} ${s.lastname.toUpperCase()}`).join(" · ")} ·
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4">
        {talks.map((talk, talkIndex) => (
          <div key={talkIndex}>
            {/* Talk title and description */}
            <div className="mx-auto max-w-6xl text-center">
              <h3 className="mb-4 text-xl font-bold text-white lg:text-2xl">{talk.title}</h3>
              <div className="text-balance text-sm leading-relaxed text-white/80 lg:text-base">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-bold text-yellow-400">{children}</strong>,
                  }}
                >
                  {talk.description}
                </ReactMarkdown>
              </div>
            </div>

            {/* Speakers for this talk */}
            <div className="flex flex-wrap justify-center gap-x-8">
              {talk.speakers.map((speaker, speakerIndex) => (
                <SpeakerCard
                  key={`${talkIndex}-${speakerIndex}`}
                  firstname={speaker.firstname}
                  lastname={speaker.lastname}
                  picture={speaker.picture}
                  jobTitle={speaker.jobTitle}
                  github={speaker.github}
                  linkedin={speaker.linkedin}
                  x={speaker.x}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
