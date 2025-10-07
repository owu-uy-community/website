import { collection, fields } from "@keystatic/core";

export const laMeetup2025 = collection({
  label: "La Meetup III - Landing",
  slugField: "slug",
  schema: {
    slug: fields.slug({ name: { label: "Slug", validation: { isRequired: true } } }),
    title: fields.text({ label: "Title", validation: { isRequired: true } }),
    subtitle: fields.text({ label: "Subtitle", validation: { isRequired: true } }),
    date: fields.date({ label: "Date", validation: { isRequired: true } }),
    location: fields.text({ label: "Location", validation: { isRequired: true } }),
    locationUrl: fields.text({ label: "Location URL", validation: { isRequired: true } }),
    primaryButtonName: fields.text({ label: "Primary Button Name", validation: { isRequired: true } }),
    primaryButtonUrl: fields.text({ label: "Primary Button Url", validation: { isRequired: true } }),
    secondaryButtonName: fields.text({ label: "Secondary Button Name", validation: { isRequired: true } }),
    secondaryButtonUrl: fields.text({
      label: "Secondary Button Url",
      validation: { isRequired: true },
    }),
    ctaText: fields.text({ label: "CTA Text", validation: { isRequired: true } }),
    ctaUrl: fields.text({ label: "CTA Url", validation: { isRequired: true } }),
    agenda: fields.array(
      fields.object({
        id: fields.integer({ label: "ID", validation: { isRequired: true } }),
        title: fields.text({ label: "Title", validation: { isRequired: true } }),
        description: fields.text({ label: "Description" }),
        extendedDescription: fields.text({
          label: "Extended Description",
          multiline: true,
        }),
        icon: fields.select({
          label: "Icon",
          options: [
            { label: "Microphone (Default)", value: "Mic" },
            { label: "Coffee Cup", value: "Coffee" },
            { label: "Message Circle", value: "MessageCircle" },
            { label: "Party Popper", value: "PartyPopper" },
            { label: "Beer", value: "Beer" },
            { label: "Clock", value: "Clock" },
          ],
          defaultValue: "Mic",
        }),
        startTime: fields.datetime({ label: "Start Time", validation: { isRequired: true } }),
        endTime: fields.datetime({ label: "End Time", validation: { isRequired: true } }),
        presenter: fields.relationship({
          label: "Presenter",
          collection: "speakers",
        }),
        location: fields.object({
          name: fields.text({ label: "Location Name", validation: { isRequired: true } }),
        }),
      }),
      { label: "Agenda Items" }
    ),
    openSpaceDescription: fields.mdx({
      label: "Open Space Description",
      extension: "md",
    }),
    openSpacePrimaryButtonName: fields.text({ label: "Open Space Primary Button Name" }),
    openSpacePrimaryButtonUrl: fields.text({ label: "Open Space Primary Button URL" }),
    openspaceGallery: fields.array(
      fields.object({
        id: fields.text({ label: "ID", validation: { isRequired: true } }),
        image: fields.image({
          label: "Image",
          directory: "public/static/2025/openspace",
          publicPath: "/static/2025/openspace/",
          validation: { isRequired: true },
        }),
        alt: fields.text({ label: "Alt Text", validation: { isRequired: true } }),
      }),
      { label: "Open Space Gallery" }
    ),
    gallery: fields.array(
      fields.object({
        id: fields.text({ label: "ID", validation: { isRequired: true } }),
        image: fields.image({
          label: "Image",
          directory: "public/static/2025/gallery",
          publicPath: "/static/2025/gallery/",
          validation: { isRequired: true },
        }),
        alt: fields.text({ label: "Alt Text", validation: { isRequired: true } }),
      }),
      { label: "Gallery" }
    ),
    sponsors: fields.array(
      fields.relationship({
        label: "Sponsor",
        collection: "sponsors",
      }),
      { label: "Sponsors" }
    ),
    staff: fields.array(
      fields.relationship({
        label: "Staff Member",
        collection: "staff",
      }),
      { label: "Staff" }
    ),
    communities: fields.array(
      fields.relationship({
        label: "Community",
        collection: "communities",
      }),
      { label: "Communities" }
    ),
    talks: fields.array(
      fields.object({
        title: fields.text({ label: "Talk Title", validation: { isRequired: true } }),
        description: fields.text({ label: "Talk Description", multiline: true, validation: { isRequired: true } }),
        speakers: fields.array(
          fields.relationship({
            label: "Speaker",
            collection: "speakers",
          }),
          { label: "Speakers", validation: { length: { min: 1 } } }
        ),
      }),
      { label: "Talks" }
    ),
  },
  path: "content/la-meetup-2025/*/",
});
