import { collection, fields } from "@keystatic/core";

export const sponsors = collection({
  label: "Sponsors",
  slugField: "slug",
  schema: {
    slug: fields.slug({ name: { label: "Slug", validation: { isRequired: true } } }),
    name: fields.text({ label: "Name", validation: { isRequired: true } }),
    logo: fields.image({
      label: "Logo",
      directory: "public/images/sponsors",
      publicPath: "/images/sponsors/",
      validation: { isRequired: true },
    }),
    website: fields.text({ label: "Website URL" }),
    description: fields.text({ label: "Description", multiline: true }),
    socialMedia: fields.object({
      linkedin: fields.text({ label: "LinkedIn URL" }),
      twitter: fields.text({ label: "Twitter URL" }),
      facebook: fields.text({ label: "Facebook URL" }),
      instagram: fields.text({ label: "Instagram URL" }),
    }),
  },
  path: "content/sponsors/*/",
});
