import { collection, fields } from "@keystatic/core";

export const landing = collection({
  label: "Landing",
  slugField: "slug",
  schema: {
    slug: fields.slug({ name: { label: "Slug", validation: { isRequired: true } } }),
    titles: fields.array(fields.text({ label: "Titles" }), {
      label: "Titles",
      itemLabel: (props) => props.value,
      validation: { length: { min: 1 } },
    }),
    subtitle: fields.text({ label: "Subtitle", validation: { isRequired: true } }),
    description: fields.text({ label: "Description", validation: { isRequired: true } }),
    mainButton: fields.text({ label: "Main Button", validation: { isRequired: true } }),
    mainButtonLink: fields.text({ label: "Main Button Link", validation: { isRequired: true } }),
    cta: fields.text({ label: "CTA", validation: { isRequired: true } }),
    ctaLink: fields.text({ label: "CTA Link", validation: { isRequired: true } }),
    mainSectionTitle: fields.text({ label: "Main Section Title", validation: { isRequired: true } }),
    mainSectionSubtitle: fields.text({ label: "Main Section Subtitle", validation: { isRequired: true } }),
    mainSectionContent: fields.mdx({
      label: "Main Section Content",
      extension: "md",
    }),
    mainSectionImage: fields.text({ label: "Main Section Image", validation: { isRequired: true } }),
    statsSectionTitle: fields.text({ label: "Stats Section Title", validation: { isRequired: true } }),
    statsSectionSubtitle: fields.text({ label: "Stats Section Subtitle", validation: { isRequired: true } }),
    stats: fields.array(
      fields.object({
        title: fields.text({ label: "Titulo" }),
        subtitle: fields.text({ label: "Subtitle" }),
        count: fields.number({ label: "Count" }),
      }),
      {
        label: "Stats",
      }
    ),
    eventsSectionTitle: fields.text({ label: "Events Section Title", validation: { isRequired: true } }),
    eventsSectionSubtitle: fields.text({ label: "Events Section Subtitle", validation: { isRequired: true } }),
  },
  path: "content/landing/*/",
});
