/**
 * Origami scenes for the Open Space explainer. Same paper vocabulary as
 * OrigamiIcons (two papers, each with a darker fold facet, visible seams,
 * flat polygons only) but on a wider canvas, because these carry a step of
 * the story rather than labelling a schedule row.
 *
 * Kept separate from OrigamiIcons so the schedule's 48×48 set stays untouched.
 */
export type OpenSpaceSceneName = "apertura" | "mercado" | "sesiones" | "clausura" | "dosPies";

const YELLOW = "#F5BB03";
const YELLOW_FOLD = "#C79A03";
const CREAM = "#FBF5E7";
const CREAM_FOLD = "#DDD2B8";
const BLUE = "#0162C8";
/** For the scene that sits on the yellow card, where yellow reads as nothing. */
const INK = "#171717";

type Paper = "cream" | "yellow" | "blue";

const FACE: Record<Paper, string> = { cream: CREAM, yellow: YELLOW, blue: BLUE };
const FOLD: Record<Paper, string> = { cream: CREAM_FOLD, yellow: YELLOW_FOLD, blue: "#014A96" };

/** A head: circle with the right half folded away from the light. */
function Head({ x, y, r, paper = "cream" }: { x: number; y: number; r: number; paper?: Paper }) {
  return (
    <>
      <circle cx={x} cy={y} fill={FACE[paper]} r={r} />
      <path d={`M${x} ${y - r}a${r} ${r} 0 0 1 0 ${r * 2}Z`} fill={FOLD[paper]} />
    </>
  );
}

/** A seated figure: folded head over a trapezoid body, seam left visible. */
function Person({
  x,
  y,
  scale = 1,
  paper = "cream",
}: {
  x: number;
  y: number;
  scale?: number;
  paper?: Paper;
}) {
  const r = 4.6 * scale;
  const top = y + r + 1.6 * scale;
  const height = 15 * scale;
  const half = 6.4 * scale;

  return (
    <g>
      <Head paper={paper} r={r} x={x} y={y} />
      <polygon
        fill={FACE[paper]}
        points={`${x - half},${top + height} ${x + half},${top + height} ${x + half * 0.42},${top} ${x - half * 0.42},${top}`}
      />
      <polygon
        fill={FOLD[paper]}
        points={`${x},${top + height} ${x + half},${top + height} ${x + half * 0.42},${top} ${x},${top}`}
      />
    </g>
  );
}

/** A proposal card: a rectangle with the corner turned up, like the real post-its. */
function Card({
  x,
  y,
  w,
  h,
  rotate = 0,
  paper = "cream",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  paper?: Paper;
}) {
  const ear = Math.min(w, h) * 0.34;

  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <polygon
        fill={FACE[paper]}
        points={`${x},${y} ${x + w},${y} ${x + w},${y + h - ear} ${x + w - ear},${y + h} ${x},${y + h}`}
      />
      <polygon fill={FOLD[paper]} points={`${x + w - ear},${y + h} ${x + w - ear},${y + h - ear} ${x + w},${y + h - ear}`} />
    </g>
  );
}

const SCENES: Record<OpenSpaceSceneName, React.ReactNode> = {
  /* Apertura — the facilitator explains the mechanics to the room. */
  apertura: (
    <>
      {/* Notched flag: bunting over the room, in the page's flag vocabulary */}
      <polygon fill={YELLOW} points="22,10 98,10 98,24 90,17 82,24 74,17 66,24 58,17 50,24 42,17 34,24 26,17 22,21" />
      <polygon fill={YELLOW_FOLD} points="60,10 98,10 98,24 90,17 82,24 74,17 66,24 60,21" />

      {/* Facilitator, centre, on yellow paper so they read as the one speaking */}
      <Person paper="yellow" scale={1.28} x={60} y={42} />

      {/* The room, in a shallow arc facing them */}
      <Person scale={0.82} x={22} y={62} />
      <Person scale={0.82} x={38} y={68} />
      <Person scale={0.82} x={82} y={68} />
      <Person scale={0.82} x={98} y={62} />
    </>
  ),

  /* Mercado de ideas — you write a topic on a card and hang it on the grid. */
  mercado: (
    <>
      {/* The board */}
      <polygon fill={CREAM} opacity=".13" points="14,10 106,10 106,64 14,64" />
      <polygon fill={CREAM} points="14,10 106,10 106,16 14,16" />
      <polygon fill={CREAM_FOLD} points="60,10 106,10 106,16 60,16" />

      {/* Cards already on the grid */}
      <Card h={13} paper="yellow" rotate={-4} w={17} x={22} y={23} />
      <Card h={13} rotate={3} w={17} x={45} y={22} />
      <Card h={13} paper="yellow" rotate={-2} w={17} x={68} y={24} />
      <Card h={13} rotate={5} w={17} x={22} y={43} />
      <Card h={13} paper="yellow" rotate={-6} w={17} x={68} y={44} />

      {/* The empty cell yours is about to fill */}
      <polygon
        fill="none"
        opacity=".5"
        points="45,43 62,43 62,56 45,56"
        stroke={YELLOW}
        strokeDasharray="3 3"
        strokeWidth="1.6"
      />

      {/* You, holding it up */}
      <Person paper="blue" scale={1.05} x={96} y={62} />
      <Card h={12} paper="yellow" rotate={-14} w={16} x={78} y={52} />
    </>
  ),

  /* Sesiones — several rooms run in parallel; you pick one. */
  sesiones: (
    <>
      {[8, 65].map((offset, index) => (
        <g key={offset}>
          <polygon
            fill={CREAM}
            opacity=".13"
            points={`${offset},16 ${offset + 47},16 ${offset + 47},80 ${offset},80`}
          />
          <polygon
            fill={index === 0 ? YELLOW : CREAM}
            points={`${offset},16 ${offset + 47},16 ${offset + 47},22 ${offset},22`}
          />
          <polygon
            fill={index === 0 ? YELLOW_FOLD : CREAM_FOLD}
            points={`${offset + 23},16 ${offset + 47},16 ${offset + 47},22 ${offset + 23},22`}
          />
          {/* A small circle of people, seen from above */}
          <Head paper={index === 0 ? "yellow" : "cream"} r={5} x={offset + 23} y={35} />
          <Head paper="cream" r={5} x={offset + 11} y={50} />
          <Head paper="cream" r={5} x={offset + 35} y={50} />
          <Head paper={index === 0 ? "yellow" : "cream"} r={5} x={offset + 23} y={65} />
        </g>
      ))}

      {/* Both rooms are running at the same time */}
      <polygon fill={YELLOW} points="58,44 64,50 58,56" />
    </>
  ),

  /* Clausura — everyone back in one circle to close the day. */
  clausura: (
    <>
      <circle cx="60" cy="48" fill="none" opacity=".18" r="32" stroke={CREAM} strokeWidth="1.5" />
      <polygon fill={YELLOW} points="60,40 68,48 60,56 52,48" />
      <polygon fill={YELLOW_FOLD} points="60,40 68,48 60,56" />

      <Head paper="cream" r={6} x={60} y={16} />
      <Head paper="yellow" r={6} x={87} y={31} />
      <Head paper="cream" r={6} x={89} y={62} />
      <Head paper="yellow" r={6} x={73} y={79} />
      <Head paper="cream" r={6} x={47} y={79} />
      <Head paper="yellow" r={6} x={31} y={62} />
      <Head paper="cream" r={6} x={33} y={31} />
    </>
  ),

  /*
   * La ley de los dos pies — if you are not learning or contributing, walk.
   * This one sits on the yellow card, so it is cream paper with ink folds:
   * yellow-on-yellow would vanish.
   */
  dosPies: (
    <>
      {/* Planted foot — forefoot tapering into a smaller heel, so it reads as a print */}
      <g transform="rotate(-10 38 48)">
        <polygon fill={CREAM} points="22,24 50,24 46,52 28,52" />
        <polygon fill={CREAM_FOLD} points="36,24 50,24 46,52 36,52" />
        <polygon fill={CREAM} points="31,58 45,58 42,72 34,72" />
        <polygon fill={CREAM_FOLD} points="38,58 45,58 42,72 38,72" />
        {/* toes */}
        <polygon fill={CREAM} points="22,20 29,20 25.5,14" />
        <polygon fill={CREAM} points="31,19 38,19 34.5,13" />
        <polygon fill={CREAM} points="40,20 47,20 43.5,14.5" />
      </g>

      {/* Lifting foot, mid-step */}
      <g opacity=".7" transform="rotate(22 76 42)">
        <polygon fill={CREAM} points="62,18 90,18 86,46 68,46" />
        <polygon fill={CREAM_FOLD} points="76,18 90,18 86,46 76,46" />
        <polygon fill={CREAM} points="71,52 85,52 82,66 74,66" />
        <polygon fill={CREAM_FOLD} points="78,52 85,52 82,66 78,66" />
        <polygon fill={CREAM} points="62,14 69,14 65.5,8" />
        <polygon fill={CREAM} points="71,13 78,13 74.5,7" />
        <polygon fill={CREAM} points="80,14 87,14 83.5,8.5" />
      </g>

      {/* Off you go */}
      <polygon fill={INK} points="100,40 112,50 100,60" />
      <polygon fill={INK} opacity=".45" points="92,42 102,50 92,58" />
    </>
  ),
};

type OpenSpaceSceneProps = {
  name: OpenSpaceSceneName;
  className?: string;
};

export default function OpenSpaceScene({ name, className }: OpenSpaceSceneProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 120 96">
      {SCENES[name]}
    </svg>
  );
}
