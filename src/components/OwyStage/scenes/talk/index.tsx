"use client";

import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";
import { TALK_SECTIONS, slideSteps, talkSlide, type TalkLayout } from "lib/owy-stage/talk/deck";

import { usePlayUrl } from "../../inputs";
import OwyFace from "../OwyFace";
import { QrCode } from "../parts";
import { OwyFeed } from "./feed";
import {
  BubblesSlide,
  BugsSlide,
  COL_X,
  EndSlide,
  LadderSlide,
  LinksSlide,
  NumbersSlide,
  OrbitSlide,
  PhotosSlide,
  PointsSlide,
  StatementSlide,
  TilesSlide,
  TimelineSlide,
  TitleSlide,
} from "./layouts";
import {
  CHAIR_LEFT,
  DevicesSlide,
  DiagramSlide,
  FaceSlide,
  FacesSlide,
  LiveSlide,
  LobbySlide,
  PhotoOpSlide,
  PitchSlide,
  PollSlide,
  QaSlide,
  RatingSlide,
  VsSlide,
} from "./live";
import { CaptionLine, CaptionsContext } from "./seat";

/**
 * «Owy, en vivo» — the talk deck on the wall. One scene for the whole talk: `slide`/`step` move
 * through `deck.ts` as params edits (the phone round never changes), the console toggles the
 * overlays. Content slides leave their right column to Owy (`Seat`); the rest show him whole.
 */

/**
 * Slides where Owy's face is part of the picture without a seat: his words run along the bottom,
 * stopping short of his chair where he sits on one (the value: the caption's right edge inset).
 */
const CAPTION_LINE: Partial<Record<TalkLayout, number>> = {
  lobby: 1920 - CHAIR_LEFT + 40,
  "photo-op": 1920 - CHAIR_LEFT + 40,
  orbit: 120,
  devices: 120,
  faces: 120,
};
/** Full-bleed slides: no section name in the corner. */
const NO_FOOTER = new Set<TalkLayout>(["lobby", "face", "title", "faces", "pitch", "photo-op", "end"]);

type Props = SceneProps<"owy-charla">;

function Slide({ params, round, eventId }: Props) {
  const slide = talkSlide(params.slide);
  const step = Math.max(0, Math.min(params.step, slideSteps(slide) - 1));
  const live = { round, eventId, params, step };

  switch (slide.layout) {
    case "lobby":
      return <LobbySlide slide={slide} {...live} />;
    case "face":
      return <FaceSlide slide={slide} {...live} />;
    case "title":
      return <TitleSlide slide={slide} step={step} />;
    case "bubbles":
      return <BubblesSlide slide={slide} step={step} />;
    case "photos":
      return <PhotosSlide slide={slide} step={step} />;
    case "statement":
      return <StatementSlide slide={slide} step={step} />;
    case "poll":
      return <PollSlide slide={slide} {...live} />;
    case "orbit":
      return <OrbitSlide slide={slide} step={step} />;
    case "tiles":
      return <TilesSlide slide={slide} step={step} />;
    case "live":
      return <LiveSlide slide={slide} {...live} />;
    case "timeline":
      return <TimelineSlide slide={slide} step={step} />;
    case "bugs":
      return <BugsSlide slide={slide} step={step} />;
    case "numbers":
      return <NumbersSlide slide={slide} step={step} />;
    case "diagram":
      return <DiagramSlide slide={slide} {...live} />;
    case "ladder":
      return <LadderSlide slide={slide} step={step} />;
    case "points":
      return <PointsSlide slide={slide} step={step} />;
    case "devices":
      return <DevicesSlide slide={slide} {...live} />;
    case "faces":
      return <FacesSlide slide={slide} {...live} />;
    case "pitch":
      return <PitchSlide slide={slide} {...live} />;
    case "vs":
      return <VsSlide slide={slide} {...live} />;
    case "links":
      return <LinksSlide slide={slide} step={step} />;
    case "qa":
      return <QaSlide slide={slide} {...live} />;
    case "rating":
      return <RatingSlide slide={slide} {...live} />;
    case "photo-op":
      return <PhotoOpSlide slide={slide} {...live} />;
    case "end":
      return <EndSlide slide={slide} step={step} />;
  }
}

function BigQr() {
  const url = usePlayUrl();
  return (
    <m.div
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex items-center gap-[110px] bg-black"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      style={{ paddingLeft: COL_X + 60 }}
    >
      <QrCode size={600} value={url} />
      <div className="w-[820px]">
        <p className="text-[104px] leading-[1.0] font-bold tracking-[-0.04em] text-balance">
          Mandale tu pregunta a Owy
        </p>
        <p className="mt-8 text-[52px] font-medium text-[#FBF5E7]/65">{url.replace(/^https?:\/\//, "")}</p>
      </div>
    </m.div>
  );
}

export function OwyCharla(props: Props) {
  const { params, eventId, round } = props;
  const slide = talkSlide(params.slide);

  return (
    <OwyFeed>
      <CaptionsContext.Provider value={params.captions}>
        <m.div
          key={slide.id}
          animate={{ opacity: 1 }}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          <Slide {...props} />
        </m.div>
        {!NO_FOOTER.has(slide.layout) && (
          <p className="absolute bottom-[48px] text-[28px] font-medium text-[#FBF5E7]/45" style={{ left: COL_X }}>
            {TALK_SECTIONS[slide.section].title}
          </p>
        )}
        {CAPTION_LINE[slide.layout] !== undefined && <CaptionLine right={CAPTION_LINE[slide.layout]} />}
        <AnimatePresence>
          {params.owy && (
            <m.div
              key="owy"
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              <OwyFace
                ambient={false}
                eventId={eventId}
                params={{ captions: params.captions }}
                round={round}
                takenAt=""
              />
            </m.div>
          )}
          {params.qr && <BigQr key="qr" />}
        </AnimatePresence>
        {params.blank && <div className="absolute inset-0 bg-black" />}
      </CaptionsContext.Provider>
    </OwyFeed>
  );
}
