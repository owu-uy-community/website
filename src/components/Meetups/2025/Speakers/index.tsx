import SpeakerCard from "./SpeakerCard";

type Speaker = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  company?: string;
  github?: string;
  linkedin?: string;
  x?: string;
};

type Talk = {
  title: string;
  description: string;
  speakers: Speaker[];
};

type SpeakerWithTalk = Speaker & {
  talkTitle: string;
  talkDescription: string;
  allSpeakers: Speaker[]; // All speakers for this talk
};

type SpeakersProps = {
  talks: Talk[];
};

export default function Speakers({ talks = [] }: SpeakersProps) {
  // Map each speaker to include their talk information and all speakers for that talk
  const speakersWithTalks: SpeakerWithTalk[] = talks.flatMap((talk) =>
    talk.speakers.map((speaker) => ({
      ...speaker,
      talkTitle: talk.title,
      talkDescription: talk.description,
      allSpeakers: talk.speakers, // Pass all speakers for this talk
    }))
  );

  if (talks.length === 0 || speakersWithTalks.length === 0) {
    return null;
  }

  return (
    <section className="w-full max-w-[1280px] pt-16">
      <div className="mb-10 text-center">
        <h2 className="mb-4 text-center text-4xl font-bold text-white md:text-5xl">Speakers</h2>
        <p className="mx-auto mt-2 max-w-3xl text-balance text-center text-base leading-relaxed text-gray-300 lg:text-lg">
          ¡Nuestros oradores que compartirán sus conocimientos!
        </p>
      </div>

      <div className="flex max-w-7xl flex-row flex-wrap items-stretch justify-center gap-5">
        {speakersWithTalks.map((speaker, index) => (
          <SpeakerCard
            key={`${speaker.firstname}-${speaker.lastname}-${index}`}
            firstname={speaker.firstname}
            lastname={speaker.lastname}
            picture={speaker.picture}
            jobTitle={speaker.jobTitle}
            company={speaker.company}
            github={speaker.github}
            linkedin={speaker.linkedin}
            x={speaker.x}
            talkTitle={speaker.talkTitle}
            talkDescription={speaker.talkDescription}
            allSpeakers={speaker.allSpeakers}
          />
        ))}
      </div>
    </section>
  );
}
