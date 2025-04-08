import { createReader } from "@keystatic/core/reader";

import Events from "components/Landing/Events";
import Hero from "components/Landing/Hero";
import Stats from "components/Landing/Stats";
import Story from "components/Landing/Story";
import Footer from "components/shared/Footer";

import keystaticConfig from "../../../../../keystatic.config";
import getEvents from "../(meetups)/2024/la-meetup/services/getEvents";

const reader = createReader(process.cwd(), keystaticConfig);

export default async function Landing() {
  const landing = await reader.collections.landing.read("2024");
  let content;

  const { titles, description, cta, ctaLink, mainSectionContent, mainSectionImage, mainButton, mainButtonLink, stats } =
    landing ?? {};

  if (mainSectionContent) content = await mainSectionContent();

  const events = await getEvents();

  return (
    <div className="container flex w-full flex-col items-center justify-center">
      <Hero
        ctaButtonText={cta}
        ctaButtonUrl={ctaLink}
        description={description}
        heroWords={titles}
        slackButtonText={mainButton}
        slackButtonUrl={mainButtonLink}
      />

      <Story content={content} image={mainSectionImage} />
      <Stats stats={stats} />
      <div className="flex w-full flex-col">
        <Events events={events} />
        <Footer />
      </div>
    </div>
  );
}
