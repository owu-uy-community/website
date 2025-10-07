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
      </div>

      <div className="mx-auto max-w-7xl space-y-12">
        {talks.map((talk, talkIndex) => (
          <div key={talkIndex} className="flex flex-col-reverse gap-8 lg:flex-row lg:items-start">
            {/* Speakers for this talk - Left side */}
            <div className="flex flex-row flex-wrap items-center gap-4 lg:w-1/2">
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

            {/* Talk title and description - Right side */}
            <div className="flex flex-col justify-center lg:w-1/2">
              <h3 className="mb-4 text-balance text-center text-lg font-bold text-white lg:text-left lg:text-xl">
                {talk.title}
              </h3>
              <div className="text-balance text-center text-sm text-white/80 lg:text-left lg:text-base">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-4 leading-6 last:mb-0">{children}</p>,
                    strong: ({ children }) => (
                      <strong className="font-bold leading-6 text-yellow-400">{children}</strong>
                    ),
                  }}
                >
                  {talk.description}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
