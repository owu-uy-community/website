export type Speaker = {
  name: string;
  /** Cutout composited over its brand shape, like the team portraits */
  picture: string;
  /** The real face behind a disguised `picture`: the site crossfades to it on hover */
  reveal?: string;
  /** The person alone, framed like `picture`, for Owy Stage to animate apart from the shape */
  cutout: string;
  /** Colour of the brand shape baked into `picture` (each speaker's is drawn in speakers.tsx) */
  shape: "yellow" | "blue" | "cream";
  role: string;
  linkedin: string;
};

export type Talk = {
  start: string;
  end: string;
  title: string;
  /** One entry per paragraph */
  description: string[];
  speakers: Speaker[];
};

/* In agenda order: the Speakers section renders them as listed and the Program reads its talk rows from here */
export const TALKS: Talk[] = [
  {
    start: "19:00",
    end: "19:40",
    title: "Retrieval Augmented Gaslight",
    description: [
      "Cómo un solo documento envenenado alcanza para que una IA con RAG mande a un usuario a un link de phishing o afirme algo falso con total seguridad. Un recorrido por cómo envenenar una base vectorial y cómo probar, automatizar y defenderse con herramientas open source, basado en el OWASP LLM Top 10.",
    ],
    speakers: [
      {
        name: "Sebastián Passaro",
        picture: "/images/conf/speakers/sebastian-passaro-durazno.webp",
        reveal: "/images/conf/speakers/sebastian-passaro.webp",
        cutout: "/images/conf/speakers/sebastian-passaro-cutout.webp",
        shape: "cream",
        role: "Cybersecurity Specialist, Qubika",
        linkedin: "https://www.linkedin.com/in/sebastian-passaro/",
      },
    ],
  },
  {
    start: "19:45",
    end: "20:25",
    title: "Kingdom Rush Battles: del lanzamiento al live ops",
    description: [
      "Cómo Ironhide llevó Kingdom Rush a su primer juego multijugador y de operación continua. Un recorrido por las decisiones de diseño, los desafíos técnicos y el uso práctico de IA en el ciclo de desarrollo.",
    ],
    speakers: [
      {
        name: "Juan Pais",
        picture: "/images/conf/speakers/juan-pais.webp",
        cutout: "/images/conf/speakers/juan-pais-cutout.webp",
        shape: "yellow",
        role: "Producer, Ironhide Game Studio",
        linkedin: "https://www.linkedin.com/in/juan-pais/",
      },
      {
        name: "Ciro Mondueri",
        picture: "/images/conf/speakers/ciro-mondueri.webp",
        cutout: "/images/conf/speakers/ciro-mondueri-cutout.webp",
        shape: "blue",
        role: "Game Programmer, Ironhide Game Studio",
        linkedin: "https://uy.linkedin.com/in/ciro-mondueri-465624256",
      },
    ],
  },
];

/**
 * The open space part of the afternoon, on the venue's clock. The agenda, the open space explainer
 * and the live board at /openspace all read it, so moving a time is one edit.
 */
export const OPEN_SPACE_TIMES = {
  bienvenida: { start: "15:00", end: "15:15" },
  mercado: { start: "15:15", end: "16:00" },
  sesiones: { start: "16:00", end: "18:25" },
  /** The break runs into the first talk. */
  coffee: { start: "18:25", end: TALKS[0].start },
} as const;
