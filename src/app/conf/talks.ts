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
  /** The talk's parts, as the speakers sent them; shown under the abstract */
  outline?: { title: string; items: string[] }[];
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
    outline: [
      {
        title: "Diseño y mercado",
        items: [
          "El mercado de juegos móviles hoy",
          "Desafíos, oportunidades y decisiones tomadas",
          "Kingdom Rush Battles vs free to play",
        ],
      },
      {
        title: "Backend en llamas",
        items: ["Supervivencia post-lanzamiento", "Actualizaciones sin downtime", "Realtime y websockets"],
      },
      {
        title: "La IA en videojuegos",
        items: [
          "Onboarding vertiginoso en ciclo de releases",
          "IA vs código de juegos: qué funciona y qué no",
          "Problemas abiertos: confiar, pero validar",
        ],
      },
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
      "Usar RAG en producción para que una IA responda con datos internos de la organización o de un dominio específico como fuente de verdad es moneda corriente. Pero investigaciones muestran que alcanza con un solo documento envenenado (un PDF, un e-mail, un ticket) para que la IA se desvíe en sus respuestas o acciones: desde mandar a un usuario a un enlace de phishing hasta afirmar con total seguridad algo falso. Como builder o tester: ¿Lo ves venir?",
      "Acá estudiamos una base de datos vectorial con su respectiva aplicación (ChromaDB+FastAPI+Ollama), la envenenamos, y mostramos una manera de probar y automatizar: de una aserción simple a un corpus de ataques y defensa en profundidad, todo con herramientas open-source. Te quedás con la visión de estas amenazas, una metodología y un repositorio para investigar (y, según tu caso, aplicar). No es una charla de AI hacking, sino de tomar parte de esa visión para la construcción y automatización de pruebas/defensas. Basado en OWASP LLM Top 10 e investigaciones como PoisonedRAG, PoisonArena y GASLITE.",
    ],
    speakers: [
      {
        name: "Sebastián Passaro",
        picture: "/images/conf/speakers/sebastian-passaro.webp",
        cutout: "/images/conf/speakers/sebastian-passaro-cutout.webp",
        shape: "triangle",
        role: "Cybersecurity Specialist, Qubika",
        linkedin: "https://www.linkedin.com/in/sebastian-passaro/",
      },
    ],
  },
];
