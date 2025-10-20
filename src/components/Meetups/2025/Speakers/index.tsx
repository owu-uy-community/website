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

type SpeakersProps = {
  talks: Talk[];
};

export default function Speakers({ talks = [] }: SpeakersProps) {
  if (talks.length === 0) {
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

      {/* 3x2 Grid: 3 columns (talks) x 2 rows (speakers per talk) */}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 lg:w-fit lg:grid-cols-3">
        {talks.map((talk, talkIndex) => (
          <div key={talkIndex} className="flex flex-col items-center gap-5">
            {talk.speakers.map((speaker, speakerIndex) => (
              <SpeakerCard
                key={`${speaker.firstname}-${speaker.lastname}-${speakerIndex}`}
                firstname={speaker.firstname}
                lastname={speaker.lastname}
                picture={speaker.picture}
                jobTitle={speaker.jobTitle}
                company={speaker.company}
                github={speaker.github}
                linkedin={speaker.linkedin}
                x={speaker.x}
                talkTitle={talk.title}
                talkDescription={talk.description}
                allSpeakers={talk.speakers}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
