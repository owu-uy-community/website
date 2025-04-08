import { collection, fields } from "@keystatic/core";

export const staff = collection({
  label: "Staff",
  slugField: "slug",
  schema: {
    slug: fields.slug({ name: { label: "Slug", validation: { isRequired: true } } }),
    firstname: fields.text({ label: "First Name", validation: { isRequired: true } }),
    lastname: fields.text({ label: "Last Name", validation: { isRequired: true } }),
    picture: fields.image({
      label: "Picture",
      directory: "public/static/staff",
      publicPath: "/static/staff/",
      validation: { isRequired: true },
    }),
    jobTitle: fields.text({ label: "Job Title", validation: { isRequired: true } }),
    bio: fields.text({ label: "Biography", multiline: true }),
    socialNetworks: fields.object({
      linkedin: fields.text({ label: "LinkedIn URL" }),
      github: fields.text({ label: "GitHub URL" }),
      twitter: fields.text({ label: "Twitter URL" }),
      email: fields.text({ label: "Email Address" }),
    }),
  },
  path: "content/staff/*/",
});
