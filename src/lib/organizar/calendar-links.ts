/** Links and data that describe an event to the outside: calendars, search engines. */
export type DescribedEvent = {
  name: string;
  summary: string | null;
  startDate: string;
  endDate: string;
  status: "draft" | "published" | "cancelled";
  mode: "presencial" | "online" | "hibrido";
  place: { name: string; area: string | null; address: string | null } | null;
  registration: "none" | "owu" | "external" | "eventbrite";
  capacity: number | null;
  taken: number;
  community: { name: string; slug: string };
  talks?: { title: string; speaker: string }[];
};

/** 20261126T220000Z, the compact UTC form calendars want */
const compact = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export const placeLine = (event: Pick<DescribedEvent, "mode" | "place">) =>
  event.mode === "online"
    ? "Online"
    : event.place
      ? [event.place.name, event.place.address ?? event.place.area].filter(Boolean).join(", ")
      : "Lugar a confirmar";

/** "Add to Google Calendar", prefilled */
export function googleCalendarUrl(event: DescribedEvent, pageUrl: string) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${compact(event.startDate)}/${compact(event.endDate)}`,
    details: [event.summary, pageUrl].filter(Boolean).join("\n\n"),
    location: placeLine(event),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** "Add to Outlook" (outlook.com and Microsoft 365 on the web), prefilled */
export function outlookCalendarUrl(event: DescribedEvent, pageUrl: string) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.name,
    startdt: new Date(event.startDate).toISOString(),
    enddt: new Date(event.endDate).toISOString(),
    body: [event.summary, pageUrl].filter(Boolean).join("\n\n"),
    location: placeLine(event),
  });

  // Outlook shows a "+" as is: spaces go as %20 (a real "+" is already %2B)
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString().replace(/\+/g, "%20")}`;
}

const MODE = {
  presencial: "https://schema.org/OfflineEventAttendanceMode",
  online: "https://schema.org/OnlineEventAttendanceMode",
  hibrido: "https://schema.org/MixedEventAttendanceMode",
} as const;

/** schema.org Event, for search engines; the online link never goes in it */
export function eventJsonLd(event: DescribedEvent, pageUrl: string, imageUrl: string) {
  const full = event.registration === "owu" && event.capacity !== null && event.taken >= event.capacity;
  const speakers = (event.talks ?? [])
    .filter((talk) => talk.speaker.trim())
    .map((talk) => ({ "@type": "Person", name: talk.speaker.trim() }));

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: event.summary ?? undefined,
    startDate: event.startDate,
    endDate: event.endDate,
    eventStatus:
      event.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: MODE[event.mode],
    location:
      event.mode === "online"
        ? { "@type": "VirtualLocation", url: pageUrl }
        : {
            "@type": "Place",
            name: event.place?.name ?? "Lugar a confirmar",
            address: event.place?.address ?? event.place?.area ?? "Montevideo, Uruguay",
          },
    image: [imageUrl],
    organizer: {
      "@type": "Organization",
      name: event.community.name,
      url: `https://www.owu.uy/comunidad/${event.community.slug}`,
    },
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "UYU",
      availability: full ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: pageUrl,
    },
    isAccessibleForFree: true,
    performer: speakers.length > 0 ? speakers : undefined,
  };
}

/** JSON for a <script> tag: `<` escaped so text can't close the tag */
export const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
