import { createReader } from "@keystatic/core/reader";
import { cache } from "react";

import OpenSpaceSummary from "components/Meetups/2024/OpenSpace";
import Agenda from "components/Meetups/2024/Agenda";
import Hero from "components/Meetups/2024/Hero";
import Sponsors from "components/Meetups/2024/Sponsors";
import Footer from "components/shared/Footer";
import Staff from "components/Meetups/2024/Staff";
import CommunitiesCarousel from "components/Meetups/2024/Communities";
import Introduction from "components/Meetups/2024/Introduction";
import { SectionKey } from "components/shared/Navbar/navSections";
import Gallery from "components/Meetups/2024/Gallery";

import {
  transformAgendaItem,
  transformArray,
  transformCommunity,
  transformSponsor,
  transformStaffMember,
  type AgendaItem,
} from "../../../../../lib/keystatic/utils";
import keystaticConfig from "../../../../../../../keystatic.config";

const reader = cache(() => createReader(process.cwd(), keystaticConfig));

export const metadata = {
  title: "La Meetup II | OWU Uruguay",
  description:
    "La Meetup ofrece un espacio para reunirnos en persona y conectar con comunidades de tecnología uruguayas.",
};

export default async function LaMeetup2024Page() {
  const laMeetup = await reader().collections.laMeetup2024.read(SectionKey.MeetupEvent);

  if (!laMeetup) return null;

  const {
    title,
    subtitle,
    date,
    location,
    locationUrl,
    primaryButtonName,
    primaryButtonUrl,
    secondaryButtonName,
    secondaryButtonUrl,
    ctaText,
    ctaUrl,
    agenda,
    openSpaceDescription,
    openSpacePrimaryButtonName,
    openSpacePrimaryButtonUrl,
    openspaceGallery,
    gallery,
    sponsors,
    staff,
    communities,
  } = laMeetup;

  // Transform content
  const content = await openSpaceDescription();

  // Type assertions for Keystatic collections
  const agendaItems = agenda as unknown as AgendaItem[];
  const sponsorSlugs = sponsors as unknown as string[];
  const staffSlugs = staff as unknown as string[];
  const communitySlugs = communities as unknown as string[];

  const transformedAgenda = await transformArray(agendaItems, transformAgendaItem);
  const transformedSponsors = await transformArray(sponsorSlugs, transformSponsor);
  const transformedStaff = await transformArray(staffSlugs, transformStaffMember);
  const transformedCommunities = await transformArray(communitySlugs, transformCommunity);

  const transformedGallery = gallery.map((item) => ({
    id: item.id,
    url: item.image,
    alt: item.alt,
  }));

  return (
    <div className="container flex w-full flex-col items-center justify-center gap-12 self-center xl:gap-28">
      <Hero
        ctaText={ctaText}
        ctaUrl={ctaUrl}
        date={date}
        location={location}
        locationUrl={locationUrl}
        primaryButtonName={primaryButtonName}
        primaryButtonUrl={primaryButtonUrl}
        secondaryButtonName={secondaryButtonName}
        secondaryButtonUrl={secondaryButtonUrl}
        subtitle={subtitle}
        title={title}
      />
      <Introduction />
      <Agenda agenda={transformedAgenda} />
      <OpenSpaceSummary
        content={content}
        gallery={openspaceGallery}
        primaryButtonName={openSpacePrimaryButtonName}
        primaryButtonUrl={openSpacePrimaryButtonUrl}
      />
      <Gallery gallery={transformedGallery} />
      <Sponsors sponsors={transformedSponsors} />
      <Staff staff={transformedStaff} />
      {/* <CommunitiesCarousel communities={transformedCommunities} /> */}
      <Footer />
    </div>
  );
}
