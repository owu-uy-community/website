import { collection, fields } from "@keystatic/core";

export const laMeetup2025 = collection({
  label: "La Meetup 2025 - Landing",
  slugField: "slug",
  schema: {
    slug: fields.slug({ name: { label: "Slug", validation: { isRequired: true } } }),
    date: fields.date({ label: "Date", validation: { isRequired: true } }),
    location: fields.text({ label: "Location", validation: { isRequired: true } }),
    locationUrl: fields.text({ label: "Location URL", validation: { isRequired: true } }),
    agenda: fields.array(
      fields.object({
        id: fields.integer({ label: "ID", validation: { isRequired: true } }),
        title: fields.text({ label: "Title", validation: { isRequired: true } }),
        description: fields.text({ label: "Description" }),
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
  },
  path: "content/la-meetup-2025/*/",
});
