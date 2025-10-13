import { RichText } from "components/shared/RichText";
import SpeakerCard from "../Speakers/SpeakerCard";

type OpenSpaceProps = {
  title?: string;
  subtitle?: string;
  content?: string;
  primaryButtonName?: string;
  primaryButtonUrl?: string;
  facilitator?: {
    firstname: string;
    lastname: string;
    jobTitle?: string;
    picture?: {
      url: string;
    };
    linkedin?: string;
    x?: string;
  };
};

export default function OpenSpace({ content, primaryButtonName, primaryButtonUrl = "#", facilitator }: OpenSpaceProps) {
  return (
    <section className="w-full max-w-[1280px] pt-16">
      <div className="mb-10 text-center">
        <h2 className="mb-4 text-center text-4xl font-bold text-white md:text-5xl">Open Space</h2>
        <p className="mx-auto mt-2 max-w-3xl text-balance text-center text-base leading-relaxed text-gray-300 lg:text-lg">
          ¡Un espacio para compartir y aprender de manera colaborativa!
        </p>
      </div>
      <div className="flex w-full flex-row flex-wrap justify-center gap-10 xl:justify-between">
        <div className="richtext flex w-full max-w-[700px] flex-col gap-3 text-white">
          <RichText content={content} />
        </div>
        <div className="flex w-full max-w-[300px] flex-col items-center justify-center gap-3">
          {facilitator ? (
            <>
              <span className="text-2xl font-bold text-white">Facilitador del espacio</span>

              <div className="flex w-full min-w-[250px] max-w-[300px] items-center justify-center lg:min-w-[230px] lg:max-w-[230px]">
                <SpeakerCard
                  firstname={facilitator.firstname}
                  lastname={facilitator.lastname}
                  picture={facilitator.picture}
                  jobTitle={facilitator.jobTitle}
                  linkedin={facilitator.linkedin}
                  x={facilitator.x}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
