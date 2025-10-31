import { collection, fields } from "@keystatic/core";

export const laMeetup2024 = collection({
  label: "La Meetup II - Landing",
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
        startTime: fields.datetime({ label: "Start Time", validation: { isRequired: true } }),
        endTime: fields.datetime({ label: "End Time", validation: { isRequired: true } }),
        presenters: fields.array(
          fields.relationship({
            label: "Presenter",
            collection: "speakers",
          }),
          { label: "Presenters" }
        ),
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
          directory: "public/images/2024/openspace",
          publicPath: "/images/2024/openspace/",
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
          directory: "public/images/2024/gallery",
          publicPath: "/images/2024/gallery/",
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
  },
  path: "content/la-meetup-2024/*/",
});
