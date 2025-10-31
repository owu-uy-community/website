import React from "react";
import { Composition, Folder } from "remotion";

import { SpeakersSchema } from "../zod-schemas/talks.types";
import { Speakers } from "../speaker/Speakers";

export function TalksComposition() {
  const startingDate = new Date(2024, 9, 19, 9);

  return (
    <Folder name="Talks">
      <Composition
        component={Speakers}
        defaultProps={{
          backgroundColor: "#18181b",
          title: "¿Cómo crear un video con Remotion?",
          startingDate,
          location: "Sinergia Faro, Montevideo",
          logoUrl: "https://www.owu.uy/images/speakers/carpincho/picture.png",
          speakers: [
            {
              pictureUrl: "https://www.owu.uy/images/speakers/carpincho/picture.png",
              name: "OWU BOT",
              company: "OWU Company",
              job: "Software Developer",
            },
          ],
        }}
        durationInFrames={140}
        fps={30}
        height={720}
        id="Speakers"
        schema={SpeakersSchema}
        width={1280}
      />
    </Folder>
  );
}
