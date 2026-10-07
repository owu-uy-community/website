export type Speaker = {
  name: string;
  /** Cutout composited over its brand shape, like the team portraits */
  picture: string;
  /** The person alone in a bottom-anchored square, for Owy Stage to animate apart from the shape */
  cutout: string;
  /** The brand shape baked into `picture` */
  shape: "flag" | "circle" | "triangle";
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
    title: "Kingdom Rush Battles: del lanzamiento al live ops",
    description: [
      "Cómo Ironhide llevó Kingdom Rush a su primer juego multijugador y de operación continua. Un recorrido por las decisiones de diseño, los desafíos técnicos y el uso práctico de IA en el ciclo de desarrollo.",
    ],
    speakers: [
      {
        name: "Juan Pais",
        picture: "/images/conf/speakers/juan-pais.webp",
        cutout: "/images/conf/speakers/juan-pais-cutout.webp",
        shape: "flag",
        role: "Producer, Ironhide Game Studio",
        linkedin: "https://www.linkedin.com/in/juan-pais/",
      },
      {
        name: "Ciro Mondueri",
        picture: "/images/conf/speakers/ciro-mondueri.webp",
        cutout: "/images/conf/speakers/ciro-mondueri-cutout.webp",
        shape: "circle",
        role: "Game Programmer, Ironhide Game Studio",
        linkedin: "https://uy.linkedin.com/in/ciro-mondueri-465624256",
      },
    ],
  },
  {
    start: "19:45",
    end: "20:25",
    title: "Retrieval Augmented Gaslight",
    description: [
      "Un chatbot de soporte que anda bien, un solo documento envenenado en la base vectorial, y de golpe manda a los usuarios a un link de phishing o defiende una mentira con total seguridad. No se hackea el modelo ni se toca una línea de código: solo se ensucian los datos.",
      "Sobre un stack RAG real y open source (ChromaDB, FastAPI y Ollama), la charla recorre una escalera de ataques mapeada al OWASP LLM Top 10, cómo probarlos de forma automatizable en un pipeline de CI y cinco capas de defensa que se activan en vivo. Te vas con una metodología replicable y el repositorio con todo el código.",
    ],
    speakers: [
      {
        name: "Sebastián Passaro",
        picture: "/images/conf/speakers/sebastian-passaro.webp",
        cutout: "/images/conf/speakers/sebastian-passaro-cutout.webp",
        shape: "triangle",
        role: "Chapter Leader, OWASP Uruguay",
        linkedin: "https://www.linkedin.com/in/sebastian-passaro/",
      },
    ],
  },
];
