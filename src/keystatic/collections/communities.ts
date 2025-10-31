import { collection, fields } from "@keystatic/core";

export const communities = collection({
  label: "Communities",
  slugField: "name",
  schema: {
    name: fields.slug({
      name: {
        label: "Name",
        validation: { isRequired: true },
      },
    }),
    picture: fields.image({
      label: "Picture",
      directory: "public/images/communities",
      publicPath: "/images/communities/",
      validation: { isRequired: true },
    }),
    website: fields.text({
      label: "Website URL",
      validation: { isRequired: false },
    }),
    description: fields.text({
      label: "Description",
      validation: { isRequired: false },
      multiline: true,
    }),
  },
  path: "content/communities/*/",
});
