/* eslint-disable @typescript-eslint/no-empty-function */
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import OpenSpaceAgenda from "../../../../../../../components/Meetups/2024/OpenSpaceAgenda";

type OpenSpaceAgendaContainerProps = {
  animate?: boolean;
};

export default function OpenSpaceAgendaContainer({ animate = false }: OpenSpaceAgendaContainerProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame,
    fps,
    from: animate ? 0 : 1,
    to: 1,
    durationInFrames: animate ? 30 : 1,
  });

  const mapUnblur = interpolate(frame, [0, 20], [5, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        top: 170,
        maxWidth: "1900px",
        margin: "0 auto",
        opacity,
        filter: animate ? `blur(${mapUnblur}px` : "none",
      }}
    >
      <div className="relative h-full w-full rounded-lg bg-transparent p-5 shadow-md backdrop-blur-xs backdrop-brightness-[1]">
        <OpenSpaceAgenda initialEpg={[]} isApp={false} />
      </div>
    </AbsoluteFill>
  );
}
