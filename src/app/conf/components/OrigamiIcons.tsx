/**
 * Origami icon set for the schedule, built strictly from the OWU shape
 * vocabulary used across the page: ◀ triangles, the notched flag, circles,
 * rectangle blocks and diamond accents. Two "papers" (cream and yellow), each
 * with a darker facet to suggest the fold, and visible seams between pieces.
 */
export type OrigamiIconName =
  | "teacup"
  | "plane"
  | "wave"
  | "bulb"
  | "chat"
  | "pizza"
  | "mic"
  | "coffee"
  | "heart"
  | "beer";

const YELLOW = "#F5BB03";
const YELLOW_FOLD = "#C79A03";
const CREAM = "#FBF5E7";
const CREAM_FOLD = "#DDD2B8";

const ICONS: Record<OrigamiIconName, React.ReactNode> = {
  teacup: (
    <>
      <polygon fill={CREAM} opacity=".85" points="14,12 24,12 19,5" />
      <polygon fill={CREAM} opacity=".5" points="26,10 34,10 30,4" />
      <polygon fill={CREAM} points="8,17 23,17 23,33 13,33" />
      <polygon fill={CREAM_FOLD} points="8,17 15,17 13,33" />
      <polygon fill={YELLOW} points="25,17 40,17 35,33 25,33" />
      <polygon fill={YELLOW_FOLD} points="41,20 47,26 41,30" />
      <polygon fill={YELLOW} points="6,37 42,37 24,45" />
      <polygon fill={YELLOW_FOLD} points="6,37 24,37 24,45" />
    </>
  ),
  plane: (
    <>
      <polygon fill={CREAM} points="3,26 45,5 22,28" />
      <polygon fill={CREAM_FOLD} points="45,5 30,18 22,28" />
      <polygon fill={YELLOW} points="24,31 45,8 29,39" />
    </>
  ),
  wave: (
    <>
      <g transform="rotate(8 22 27)">
        <polygon fill={YELLOW} points="13,27 6,24 4,28 12,33" />
        <polygon fill={YELLOW_FOLD} points="9,25.7 6,24 4,28 8.5,29.9" />
        <polygon fill={YELLOW} points="12.8,24 16.4,24 15.6,11 13,12" />
        <polygon fill={YELLOW} points="16.8,24 20.4,24 20.2,8 17.2,8" />
        <polygon fill={YELLOW_FOLD} points="20.8,24 24.4,24 24.6,8.5 21.6,9" />
        <polygon fill={YELLOW_FOLD} points="24.8,24 28.4,24 29.2,12 26,11" />
        <polygon fill={YELLOW} points="12,23 30,23 30,37 22,41 12,38" />
        <polygon fill={YELLOW_FOLD} points="22,23 30,23 30,37 22,41" />
      </g>
      <polygon fill={CREAM} points="34,15 38,20 34,25 35.9,25 39.9,20 35.9,15" />
      <polygon fill={CREAM} opacity=".6" points="38.6,12 43.2,20 38.6,28 40.5,28 45.1,20 40.5,12" />
    </>
  ),
  bulb: (
    <>
      <polygon fill={YELLOW} points="9,5 15,7 11,13" />
      <polygon fill={YELLOW} points="39,5 33,7 37,13" />
      <polygon fill={YELLOW} points="21,1 27,1 24,6" />
      <circle cx="24" cy="18" fill={CREAM} r="11" />
      <path d="M24 7a11 11 0 0 1 0 22Z" fill={CREAM_FOLD} />
      <polygon fill={YELLOW} points="19,32 29,32 28,38 20,38" />
      <polygon fill={YELLOW_FOLD} points="20,40 28,40 24,45" />
    </>
  ),
  chat: (
    <>
      <polygon fill={CREAM} points="7,7 41,7 41,27 7,27" />
      <polygon fill={CREAM_FOLD} points="24,7 41,7 41,27 24,27" />
      <polygon fill={YELLOW} points="11,29 21,29 11,39" />
      <polygon fill={YELLOW} points="16,14 19,17 16,20 13,17" />
      <polygon fill={YELLOW} points="24,14 27,17 24,20 21,17" />
      <polygon fill={YELLOW_FOLD} points="32,14 35,17 32,20 29,17" />
    </>
  ),
  pizza: (
    <>
      <polygon fill={YELLOW} points="8,6 40,6 37,12 11,12" />
      <polygon fill={YELLOW_FOLD} points="24,6 40,6 37,12 24,12" />
      <polygon fill={CREAM} points="12,14 36,14 24,40" />
      <polygon fill={CREAM_FOLD} points="24,14 36,14 24,40" />
      <polygon fill={YELLOW} points="19,16 22,19 19,22 16,19" />
      <polygon fill={YELLOW_FOLD} points="28,15 31,18 28,21 25,18" />
      <polygon fill={YELLOW} points="23,25 26,28 23,31 20,28" />
    </>
  ),
  mic: (
    <>
      <circle cx="24" cy="13" fill={YELLOW} r="10" />
      <path d="M24 3a10 10 0 0 1 0 20Z" fill={YELLOW_FOLD} />
      <polygon fill={CREAM} points="21,26 27,26 26,37 22,37" />
      <polygon fill={YELLOW} points="14,41 34,41 24,47" />
      <polygon fill={YELLOW_FOLD} points="14,41 24,41 24,47" />
    </>
  ),
  coffee: (
    <>
      <polygon fill={CREAM} opacity=".7" points="20,6 28,6 24,0" />
      <polygon fill={YELLOW} points="13,9 35,9 33,14 15,14" />
      <polygon fill={YELLOW_FOLD} points="24,9 35,9 33,14 24,14" />
      <polygon fill={CREAM} points="15,16 33,16 29,43 19,43" />
      <polygon fill={CREAM_FOLD} points="24,16 33,16 29,43 24,43" />
      <polygon fill={YELLOW} points="16,23 32,23 32,31 16,31 21,27" />
    </>
  ),
  heart: (
    <>
      <polygon fill={CREAM} points="23,42 7,24 7,13 15,6 23,14" />
      <polygon fill={YELLOW} points="25,42 25,14 33,6 41,13 41,24" />
      <polygon fill={YELLOW_FOLD} points="25,42 33,32 25,22" />
    </>
  ),
  beer: (
    <>
      <polygon fill={CREAM} points="11,12 19,12 15,5" />
      <polygon fill={CREAM} points="19,12 27,12 23,5" />
      <polygon fill={CREAM} opacity=".8" points="27,12 33,12 30,6" />
      <polygon fill={YELLOW} points="12,14 32,14 30,43 14,43" />
      <polygon fill={YELLOW_FOLD} points="12,14 21,14 17,43 14,43" />
      <polygon fill={CREAM} points="33,18 41,23 33,31" />
    </>
  ),
};

type OrigamiIconProps = {
  name: OrigamiIconName;
  className?: string;
};

export default function OrigamiIcon({ name, className }: OrigamiIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 48 48">
      {ICONS[name]}
    </svg>
  );
}
