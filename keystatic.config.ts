/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { config, fields } from "@keystatic/core";

import { landing } from "keystatic/collections/landing";
import { laMeetup2024 } from "keystatic/collections/la-meetup-2024";
import { laMeetup2025 } from "keystatic/collections/la-meetup-2025";
import { sponsors } from "keystatic/collections/sponsors";
import { speakers } from "keystatic/collections/speakers";
import { staff } from "keystatic/collections/staff";
import { communities } from "keystatic/collections/communities";

export const markdocConfig = fields.markdoc.createMarkdocConfig({});

// storage: {
//   kind: "github",
//   repo: {
//     owner: "owu-uy",
//     name: "website",
//   },
//   branchPrefix: "main",
// },

export default config({
  storage: {
    kind: "local",
  },
  collections: {
    landing,
    laMeetup2024,
    laMeetup2025,
    sponsors,
    speakers,
    staff,
    communities,
  },
  ui: {
    brand: { name: "OWU CMS" },
  },
});
