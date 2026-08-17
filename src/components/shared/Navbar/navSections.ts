export enum SectionKey {
  Hero = "inicio",
  Story = "historia",
  Stats = "estadisticas",
  Events = "eventos",
  Blog = "blog",
  MeetupEvent = "la-meetup",
}

export interface Section {
  id: SectionKey;
  link: string;
  title: string;
}

export const navSections: Record<SectionKey, Section> = {
  [SectionKey.Hero]: { title: "Inicio", link: "/#inicio", id: SectionKey.Hero },
  [SectionKey.Story]: { title: "Historia", link: "/#historia", id: SectionKey.Story },
  [SectionKey.Stats]: { title: "Estadísticas", link: "/#estadisticas", id: SectionKey.Stats },
  [SectionKey.Events]: { title: "Eventos", link: "/#eventos", id: SectionKey.Events },
  [SectionKey.Blog]: { title: "Blog", link: "/blog", id: SectionKey.Blog },
  // The headline event now points to OWU CONF. The enum value ("la-meetup") is reused
  // as a Keystatic content slug in the La Meetup pages, so only the label + link change.
  [SectionKey.MeetupEvent]: { title: "OWU CONF", link: "https://conf.owu.uy", id: SectionKey.MeetupEvent },
};
