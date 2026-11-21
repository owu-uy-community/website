/** Topics shared by the community directory and the talk archive: one vocabulary for both filters. */
export const TOPICS = [
  { value: "lenguajes", label: "Lenguajes" },
  { value: "web", label: "Web y frontend" },
  { value: "mobile", label: "Mobile" },
  { value: "data-ia", label: "Data e IA" },
  { value: "seguridad", label: "Seguridad" },
  { value: "cloud", label: "Cloud e infra" },
  { value: "testing", label: "Testing y QA" },
  { value: "carrera", label: "Carrera y equipos" },
  { value: "diversidad", label: "Diversidad" },
  { value: "general", label: "General" },
] as const;

export type Topic = (typeof TOPICS)[number]["value"];

const LABELS = new Map<string, string>(TOPICS.map(({ value, label }) => [value, label]));

export const topicLabel = (value: string) => LABELS.get(value) ?? value;
