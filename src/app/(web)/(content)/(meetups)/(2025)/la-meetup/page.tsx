import { createReader } from "@keystatic/core/reader";
import { cache } from "react";
import { type Metadata } from "next";

import Hero from "components/Meetups/2025/Hero";
import Footer from "components/shared/Footer";
import Intro from "components/Meetups/2025/Intro";
import CallForProposalBanner from "components/Meetups/2025/CallForProposalBanner";
import CallForProposals from "components/Meetups/2025/CallForProposals";
import Sponsors from "components/Meetups/2025/Sponsors";
import Speakers from "components/Meetups/2025/Speakers";
import { SectionKey } from "components/shared/Navbar/navSections";
import AgendaSection from "components/Meetups/2025/Agenda";

import {
  transformArray,
  transformSponsor,
  transformAgendaItem,
  transformTalk,
  type AgendaItem,
  type Talk,
} from "../../../../../lib/keystatic/utils";
import keystaticConfig from "../../../../../../../keystatic.config";

const reader = cache(() => createReader(process.cwd(), keystaticConfig));

export const metadata: Metadata = {
  title: "La Meetup III | OWU Uruguay",
  description:
    "Tercera edición de La Meetup, el encuentro anual que reúne a las comunidades tecnológicas de Uruguay para estrechar lazos, colaborar e impulsar la cultura del software.",
};

export default async function LaMeetup2025() {
  const laMeetup = await reader().collections.laMeetup2025.read(SectionKey.MeetupEvent);

  if (!laMeetup) return null;

  const { agenda, sponsors, talks } = laMeetup ?? {};

  // Type assertions for Keystatic collections
  const agendaItems = agenda as unknown as AgendaItem[];
  const sponsorSlugs = sponsors as unknown as string[];
  const talksList = talks as unknown as Talk[];

  const transformedAgenda = await transformArray(agendaItems, transformAgendaItem);
  const transformedSponsors = await transformArray(sponsorSlugs, transformSponsor);
  const transformedTalks = await transformArray(talksList, transformTalk);

  return (
    <>
      <CallForProposalBanner />
      <div className="container flex w-full flex-col items-center justify-center gap-2 self-center">
        <Hero />
        <Intro />
        {/* <CallForProposals /> */}
        <AgendaSection agenda={transformedAgenda} />
        <Speakers talks={transformedTalks} />
        <Sponsors sponsors={transformedSponsors} />
        <Footer />
      </div>
    </>
  );
}
