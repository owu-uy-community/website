import { collection, fields } from "@keystatic/core";

export const speakers = collection({
  label: "Speakers",
  slugField: "slug",
  schema: {
    slug: fields.slug({ name: { label: "Slug", validation: { isRequired: true } } }),
    firstname: fields.text({ label: "First Name", validation: { isRequired: true } }),
    lastname: fields.text({ label: "Last Name", validation: { isRequired: true } }),
    picture: fields.image({
      label: "Picture",
      directory: "public/images/speakers",
      publicPath: "/images/speakers/",
      validation: { isRequired: true },
    }),
    jobTitle: fields.text({ label: "Job Title" }),
    company: fields.text({ label: "Company" }),
    bio: fields.text({ label: "Biography", multiline: true }),
    linkedin: fields.text({ label: "LinkedIn URL" }),
    github: fields.text({ label: "GitHub URL" }),
    x: fields.text({ label: "X URL" }),
    website: fields.text({ label: "Personal Website" }),
  },
  path: "content/speakers/*/",
});
