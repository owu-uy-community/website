export enum SectionKey {
  Hero = "inicio",
  Story = "historia",
  Stats = "estadisticas",
  Events = "eventos",
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
  [SectionKey.MeetupEvent]: { title: "La Meetup 2025", link: "/la-meetup", id: SectionKey.MeetupEvent },
};
