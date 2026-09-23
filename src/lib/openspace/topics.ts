/**
 * The interest taxonomy behind "Para vos" on the live page.
 *
 * A fixed, small vocabulary on purpose: the model tags talks *into* it rather
 * than inventing labels, so a card written at 10:30 is comparable with the
 * chips somebody tapped at 10:05. Ten topics is about as many as a person will
 * read standing up in a hallway.
 */

export const TOPICS = [
  {
    id: "frontend",
    label: "Frontend",
    keywords: ["frontend", "react", "next", "vue", "svelte", "css", "tailwind", "ui", "browser", "web", "typescript"],
  },
  {
    id: "backend",
    label: "Backend & APIs",
    keywords: ["backend", "api", "rest", "graphql", "node", "elixir", "rails", "django", "microservicio", "arquitectura"],
  },
  {
    id: "ia",
    label: "IA & LLMs",
    keywords: ["ia", "ai", "llm", "gpt", "machine learning", "rag", "agente", "prompt", "modelo", "red neuronal", "neural", "deep learning", "embedding"],
  },
  {
    id: "datos",
    label: "Datos",
    keywords: ["datos", "data", "sql", "postgres", "etl", "pipeline", "analytics", "warehouse", "pandas"],
  },
  {
    id: "devops",
    label: "DevOps & Cloud",
    keywords: ["devops", "cloud", "aws", "kubernetes", "docker", "ci", "cd", "deploy", "infra", "observabilidad"],
  },
  {
    id: "seguridad",
    label: "Seguridad",
    keywords: ["seguridad", "security", "pentest", "hacking", "forense", "vulnerabilidad", "criptografia", "auth"],
  },
  {
    id: "producto",
    label: "Producto & Diseño",
    keywords: ["producto", "product", "diseño", "design", "ux", "ui", "usuario", "research", "accesibilidad"],
  },
  {
    id: "carrera",
    label: "Carrera & Equipos",
    keywords: ["carrera", "senior", "junior", "mentoria", "equipo", "liderazgo", "entrevista", "remoto", "cultura"],
  },
  {
    id: "mobile",
    label: "Mobile",
    keywords: ["mobile", "android", "ios", "swift", "kotlin", "flutter", "react native", "app"],
  },
  {
    id: "comunidad",
    label: "Open source & comunidad",
    keywords: ["open source", "comunidad", "oss", "contribuir", "meetup", "licencia", "mantener"],
  },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((topic) => topic.id);

const BY_ID = new Map(TOPICS.map((topic) => [topic.id, topic]));

export function topicLabel(id: TopicId): string {
  return BY_ID.get(id)?.label ?? id;
}

export function isTopicId(value: string): value is TopicId {
  return BY_ID.has(value as TopicId);
}

/** Case- and accent-insensitive, so "Diseño" matches "diseno". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Matches at a word start, not anywhere in the string. A plain `includes`
 * tagged "análisis forense en ciberseguridad" as DevOps, because "ci" sits
 * inside "ciberseguridad".
 *
 * The word is allowed to continue, so "pentest" still catches "Pentesting" and
 * "api" catches "APIs" — except for the two-letter keywords ("ci", "cd", "ia",
 * "ai", "ui", "ux"), which need a closing boundary too or they match half the
 * dictionary.
 *
 * Boundaries are spelled out rather than using `\b` so keywords containing
 * punctuation ("next.js", "ci/cd") still match at the edges of a title.
 */
function mentions(haystack: string, keyword: string): boolean {
  const folded = fold(keyword);
  const escaped = folded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = folded.length <= 2 ? "([^a-z0-9]|$)" : "";

  return new RegExp(`(^|[^a-z0-9])${escaped}${tail}`).test(haystack);
}

/**
 * Keyword tagging — the fallback for when the model is unavailable, and the
 * reason a gateway outage on event day degrades the ranking instead of
 * removing the feature.
 */
export function topicsFromText(text: string): TopicId[] {
  const haystack = fold(text);

  return TOPICS.filter((topic) => topic.keywords.some((keyword) => mentions(haystack, keyword))).map(
    (topic) => topic.id
  );
}

/**
 * What the session is shaped like. The model infers it from the title — an
 * open space card that says "¿alguien me cuenta sobre X?" is a question, not a
 * talk — and it is what makes the second survey question worth asking.
 */
export const FORMATS = [
  { id: "charla", label: "Charla" },
  { id: "demo", label: "Demo" },
  { id: "debate", label: "Debate" },
  { id: "pregunta", label: "Pregunta abierta" },
] as const;

export type FormatId = (typeof FORMATS)[number]["id"];

const FORMAT_IDS = new Set<string>(FORMATS.map((format) => format.id));

export function isFormatId(value: string): value is FormatId {
  return FORMAT_IDS.has(value);
}

export function formatLabel(id: FormatId): string {
  return FORMATS.find((format) => format.id === id)?.label ?? id;
}

/** What someone came for, and the session shapes that deliver it. */
export const GOALS = [
  { id: "aprender", label: "Aprender algo nuevo", formats: ["charla", "demo"] },
  { id: "debatir", label: "Debatir un problema real", formats: ["debate", "pregunta"] },
  { id: "conocer", label: "Conocer gente del palo", formats: ["pregunta", "debate"] },
  { id: "todo", label: "Lo que venga", formats: [] },
] as const;

export type GoalId = (typeof GOALS)[number]["id"];

export function isGoalId(value: string): value is GoalId {
  return GOALS.some((goal) => goal.id === value);
}

export type TrackTags = { topics: TopicId[]; format: FormatId | null };

export type Match = {
  /** Higher is a better fit. 0 means nothing in common. */
  score: number;
  /** The overlapping topics, for showing "por qué". */
  matched: TopicId[];
  /** True when the session's shape is what the visitor came for. */
  suitsGoal: boolean;
};

/**
 * Topic overlap dominates, session shape breaks ties: someone who picked
 * "debatir" should see a debate above a talk on the same subject, but never
 * above a talk that actually matches two of their topics.
 *
 * With no topic overlap the score is 0 even when the format fits — otherwise
 * every debate on the board would surface as a suggestion to anyone who came
 * to debate, regardless of what it is about.
 */
export function matchTrack(
  tags: TrackTags | undefined,
  interests: readonly TopicId[],
  goal: GoalId
): Match {
  const wanted = new Set<string>(interests);
  const matched = (tags?.topics ?? []).filter((topic): topic is TopicId => wanted.has(topic) && isTopicId(topic));

  const goalFormats = GOALS.find((entry) => entry.id === goal)?.formats ?? [];
  const suitsGoal = Boolean(tags?.format && (goalFormats as readonly string[]).includes(tags.format));

  const score = matched.length === 0 ? 0 : matched.length * 2 + (suitsGoal ? 1 : 0);

  return { score, matched, suitsGoal };
}
