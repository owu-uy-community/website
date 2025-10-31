/* eslint-disable react/function-component-definition */
import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame } from "remotion";

import { BackgroundCircleNoise } from "../../../design/atoms/BackgroundCircleNoise";

import { SpeakerCard } from "./SpeakersCard";

const speakers = [
  {
    name: "El Cuervo",
    photo: "/images/speakers/el-cuervo/picture.webp",
    talk: "Historias de filtraciones pesadas y la ley nueva de ciberdelincuencia",
  },
  {
    name: "Eliana Budelli",
    photo: "/images/speakers/eliana-budelli/picture.png",
    talk: "Sesgos en GenAI: Tipos, causas y estrategias de mitigación!",
  },
  {
    name: "Rodrigo Ponce de León",
    photo: "/images/speakers/rodrigo-ponce-de-leon/picture.png",
    talk: "Despertá al líder que llevás dentro",
  },
];

export const Speakers: React.FC = () => {
  const frame = useCurrentFrame();
  const speakerDuration = 150;

  const currentSpeakerIndex = Math.floor(frame / speakerDuration) % speakers.length;
  const nextSpeakerIndex = (currentSpeakerIndex + 1) % speakers.length;

  const currentSpeakerProgress = spring({
    frame: frame % speakerDuration,
    fps: 30,
    config: {
      damping: 200,
    },
  });

  const nextSpeakerProgress = spring({
    frame: frame % speakerDuration,
    fps: 30,
    config: {
      damping: 200,
    },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#18181b" }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${interpolate(currentSpeakerProgress, [0, 1], [0, -100])}%)`,
        }}
      >
        <SpeakerCard {...speakers[currentSpeakerIndex]} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translateX(${interpolate(nextSpeakerProgress, [0, 1], [100, 0])}%)`,
        }}
      >
        <SpeakerCard {...speakers[nextSpeakerIndex]} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
