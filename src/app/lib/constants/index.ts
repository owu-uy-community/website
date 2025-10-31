// Auth Constants
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://localhost:3000";
export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? "localhost";
export const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
export const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

// Only use secure cookies in production
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const USE_SECURE_COOKIES = IS_PRODUCTION;

// Allowed emails for authentication (comma-separated in env variable)
// Example: ALLOWED_EMAILS=user1@example.com,user2@example.com,admin@company.com
export const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map((email) => email.trim().toLowerCase())
  : [];

// Eventbrite Constants
export const EVENTBRITE_API_URL = "https://www.eventbriteapi.com/v3";
export const EVENTBRITE_API_KEY = process.env.EVENTBRITE_API_KEY!;
export const EVENTBRITE_EVENT_ID = process.env.NEXT_PUBLIC_EVENTBRITE_EVENT_ID ?? "";

// Event Dates
export const EVENT_DATES = {
  ticketDeadline: new Date("2025-07-31T23:59:59"),
  meetup2025: new Date("2025-11-01T00:00:00"),
} as const;

// OpenSpace Room Colors
export const ROOM_COLORS = {
  LOBBY: "#03A9F4",
  CENTRO: "#FFEB3B",
  VENTANA: "#FF9800",
  CUEVA: "#74B276",
  RINCÓN: "#CD363C",
} as const;

export type RoomName = keyof typeof ROOM_COLORS;

// OBS Configuration
export const OBS_CONFIG = {
  defaults: {
    address: "localhost",
    port: "4455",
    screenshotDelay: "1000",
    streamFps: "15",
    streamQuality: "85",
  },
  timeouts: {
    sceneSwitch: 2000, // ms - timeout for optimistic scene switch
    gracePeriod: 2000, // ms - grace period for scene drift detection
  },
  delays: {
    default: 5, // seconds - default delay between scenes
    min: 1, // seconds - minimum delay
    max: 300, // seconds - maximum delay
  },
} as const;

// Social Media Links
export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/owu__uy/",
  linkedin: "https://www.linkedin.com/company/owu-uruguay/",
  slack: "https://slack.owu.uy/",
} as const;

// External Service URLs
export const EXTERNAL_SERVICES = {
  googleForms: {
    callForProposals: "https://forms.gle/FJErDF2AvDW4kDba6",
    interest2024:
      "https://docs.google.com/forms/d/e/1FAIpQLSe7QPkYcoz1tZ-j4N-BvqNfkLMtp9Oq8vQ285mTR7EuJPDVnw/viewform?embedded=true",
    interest2025:
      "https://docs.google.com/forms/d/e/1FAIpQLSf5c4z67ZcVvv7ONQYhlzaXXsRd0ZWyBrLKamtXanD3b1Bz4w/viewform?embedded=true",
    sponsors2024:
      "https://docs.google.com/forms/d/e/1FAIpQLSemC7vrDw38LTWcBUhIYjarqMMVUfE-dSnBPUAsNzBWd6uqcQ/viewform?embedded=true",
    sponsors2025:
      "https://docs.google.com/forms/d/e/1FAIpQLSeZGSpB95IZH6Texu2CqjHNw27pJye1nzEtJn5Y90gJiD0orA/viewform?embedded=true",
  },
  googleSheets: {
    openSpaceEpg:
      "https://docs.google.com/spreadsheets/d/1GPhu-OIcZbIZE3x4xmQvpL0j_rqPfr6wqDwiYdgcC1U/export?format=csv",
  },
  googleTagManager: "https://www.googletagmanager.com/gtag/js?id=G-RVTWHW4J21",
  meetupBot: "https://meetup-bot.marpo60.xyz/json",
} as const;

// Maps and Location URLs
export const MAPS_URLS = {
  meetupLocation: "https://maps.app.goo.gl/PWsJEYZGZdzGkmaRA",
} as const;

// Internal Routes
export const INTERNAL_ROUTES = {
  auth: {
    login: "/login",
    register: "/registro",
    profile: "/perfil",
    community: "/comunidad",
  },
  legal: {
    terms: "/terms",
    privacy: "/privacy",
  },
  meetups: {
    current: "/la-meetup",
    interest: "/la-meetup/interes",
    sponsors: "/la-meetup/sponsors",
    callForProposals: "/la-meetup/#call-for-proposals",
    meetup2023: "/2023/la-meetup/",
    meetup2024: "/2024/la-meetup/",
    meetup2025: "/la-meetup/",
  },
} as const;

// External Platform URLs
export const EXTERNAL_PLATFORMS = {
  linkedin: {
    base: "https://linkedin.com/in/",
    company: "https://www.linkedin.com/company/owu-uruguay/",
    posts: "https://www.linkedin.com/company/owu-uruguay/posts/",
  },
} as const;

export const LA_MEETUP = {
  title: "LA",
  subtitle: "MEETUP",
  date: "2023-11-25 09:00:00",
  fullDate: "25 de Noviembre 2023",
  location: "Sinergia Faro, Víctor Soliño 349, Montevideo",
  location_url: "https://maps.app.goo.gl/PWsJEYZGZdzGkmaRA",
  agenda: {
    scheduleTitle: "Agenda",
    scheduleList: [
      {
        title: "Recepción y desayuno",
        startTime: "2023-11-25 09:00",
        endTime: "2023-11-25 10:00",
        description: "Te invitamos a compartir y disfrutar de un rico desayuno. ¡Bienvenidos a La Meetup I!",
      },
      {
        title: "Open Space",
        startTime: "2023-11-25 10:00",
        endTime: "2023-11-25 13:30",
        description: "Espacio abierto para discutir sobre tecnología y programación.",
      },
      {
        title: "Almuerzo",
        startTime: "2023-11-25 13:30",
        endTime: "2023-11-25 15:00",
        description:
          "No proveemos el almuerzo. Te sugerimos traer tu propia comida o salir a comer en los alrededores (plaza de comida, shopping).",
      },
      {
        title: "Testing de sistemas basados en LLMs",
        startTime: "2023-11-25 15:00",
        endTime: "2023-11-25 15:40",
        description:
          "Charla acerca de la importancia de los testing de sistemas basados en LLMs dictada por Federico Toledo.",
      },
      {
        title: "Construyendo para todos: Accesibilidad en el desarrollo web.",
        startTime: "2023-11-25 15:40",
        endTime: "2023-11-25 16:20",
        description:
          "Charla acerca de la accesibilidad en el desarrollo web dictada por Elizabeth Lofredo y Agustina Chaer.",
      },
      {
        title: "Coffee Break",
        startTime: "2023-11-25 16:20",
        endTime: "2023-11-25 17:00",
        description: "¡A disfrutar de un rico café!",
      },
      {
        title: "HDP: Historias de Pandemia",
        startTime: "2023-11-25 17:00",
        endTime: "2023-11-25 18:00",
        description: "Charla acerca de las historias de pandemia dictada por elcuervo.",
      },
    ],
  },
  speakers: {
    speakersTitle: "Speakers",
    speakersSubtitle: "Voces que inspiran, explorá nuestro listado de oradores",
    speakersList: [
      {
        name: "Federico Toledo",
        role: "Co-Founder Abstracta",
        image: "/images/archive/speakers/federico_toledo.webp",
        linkedin: "federicotoledo",
      },
      {
        name: "elcuervo",
        role: "",
        image: "/images/archive/speakers/elcuervo.webp",
        linkedin: "brunoaguirre",
      },
      {
        name: "Elizabeth Lofredo",
        role: "Engineering Lead",
        image: "/images/archive/speakers/elizabeth_lofredo.webp",
        linkedin: "elizabethlofredo",
      },
      {
        name: "Agustina Chaer",
        role: "Tech Lead",
        image: "/images/archive/speakers/agustina_chaer.webp",
        linkedin: "agustinachaer",
      },
    ],
  },
  openSpace: {
    openSpaceTitle: "¿Qué es un Open Space?",
    openSpaceSubtitle:
      "Un Open Space es un formato de conferencia o reunión abierta, donde la principal característica es que la agenda se genera de manera dinámica entre todos los participantes de la reunión. En general constan de 4 partes: Apertura, Mercado de ideas,Sesiones y Clausura.",
    openSpaceStages: [
      {
        title: "Apertura",
        description:
          "Un facilitador explica la estructura y mecánica del Open Space. En este momento la agenda del evento está vacía!",
      },
      {
        title: "Mercado de ideas",
        description:
          "Luego cada participante que desee proponer un tema tiene un máximo de 2 minutos para contarle al resto sobre lo que desea hablar o escuchar. Al finalizar se tendrá la agenda completa de donde los participantes seleccionarán los temas de su interés.",
      },
      {
        title: "Sesiones",
        description:
          "Conversaciones del tópico seleccionado, los participantes se auto-organizan en los lugares predefinidos.",
      },
      {
        title: "Clausura",
        description:
          "Luego de finalizar todas las sesiones y con ayuda del facilitador, los participantes se reúnen nuevamente para realizar el cierre del evento.",
      },
    ],
    openSpaceHowToParticipateTitle: "¿Cómo puedo participar?",
    openSpaceHowToParticipateDescription: "En un Open Space hay lugar para cualquier tipo de sesión.",
    openSpaceIPresentTitle: `Sesión del tipo "Yo presento":`,
    openSpaceIPresentDescription:
      "Tengo un tema sobre el que (creo que) sé y quiero transmitir ese conocimiento. Puede ser una presentación tipo PPT, un workshop con una laptop por persona, lo que me plazca. Una variante poco usada es 'quiero aprender sobre', en la que alguien pasa al centro y pregunta '¿Alguien me puede explicar cómo funciona la fisión nuclear?'. Si nadie sabe del tema, simplemente no ocurre la sesión. O mejor aún, nos juntamos a googlear.",
    openSpaceLetsDiscussTitle: `Sesión del tipo "Discutamos":`,
    openSpaceLetsDiscussDescription:
      "Considero que este es un tema abierto, sobre el que me gustaría que simplemente charlemos. Esta es la típica sesión que se termina haciendo con un círculo de sillas y es la más asociada a un open space. Una posible variante es la sesión 'de trabajo', en la cual esperamos tener un cierto output. Por ejemplo 'planifiquemos cómo festejar si Filipinas gana el mundial'.",
  },
  sponsors: {
    sponsorsTitle: "Sponsors",
    sponsorsSubtitle: "Nuestros aliados y patrocinadores que hacen este evento posible",
    sponsorsList: [
      {
        name: "cedarcode",
        logo: "/images/archive/sponsors/cedarcode.webp",
        url: "https://www.cedarcode.com/",
      },
      {
        name: "infuy",
        logo: "/images/archive/sponsors/infuy.webp",
        url: "https://www.infuy.com/",
      },
      {
        name: "ingenious",
        logo: "/images/archive/sponsors/ingenious.webp",
        url: "https://ingenious.agency/",
      },
      {
        name: "mimiquate",
        logo: "/images/archive/sponsors/mimiquate.webp",
        url: "https://www.mimiquate.com/",
      },
      {
        name: "neocoast",
        logo: "/images/archive/sponsors/neocoast.webp",
        url: "https://www.neocoast.com/",
      },
      {
        name: "octobot",
        logo: "/images/archive/sponsors/octobot.webp",
        url: "https://www.octobot.io/",
      },
      {
        name: "pymo",
        logo: "/images/archive/sponsors/pymo.webp",
        url: "https://pymo.uy/",
      },
      {
        name: "streaver",
        logo: "/images/archive/sponsors/streaver.webp",
        url: "https://www.streaver.com/",
      },
      {
        name: "wyeworks",
        logo: "/images/archive/sponsors/wyeworks.webp",
        url: "https://www.wyeworks.com/",
      },
      {
        name: "xmartlabs",
        logo: "/images/archive/sponsors/xmartlabs.webp",
        url: "https://xmartlabs.com/",
      },
      {
        name: "qubika",
        logo: "/images/archive/sponsors/qubika.webp",
        url: "https://qubika.com/",
      },
      {
        name: "rootstrap",
        logo: "/images/archive/sponsors/rootstrap.webp",
        url: "https://www.rootstrap.com/",
      },
      {
        name: "vangwe",
        logo: "/images/archive/sponsors/vangwe.webp",
        url: "https://www.vangwe.com/",
      },
      {
        name: "hackacademy",
        logo: "/images/archive/sponsors/hackacademy.webp",
        url: "https://ha.dev/",
      },
      {
        name: "Holberton Uruguay",
        logo: "/images/archive/sponsors/holberton.webp",
        url: "https://holbertonschool.uy/",
      },
      {
        name: "Sophilabs Uruguay",
        logo: "/images/archive/sponsors/sophilabs.webp",
        url: "https://sophilabs.com/",
      },
    ],
  },
  communities: {
    communitiesTitle: "Comunidades Aliadas",
    communitiesSubtitle: "Nuestras comunidades aliadas",
    communitiesList: [
      {
        name: "Mujeres IT",
        logo: "/images/communities/mujeres_it.webp",
        url: "https://mujeresit.com/",
      },
      {
        name: "Girls in tech",
        logo: "/images/communities/girls_in_tech.webp",
        url: "https://uruguay.girlsintech.org/",
      },
      {
        name: "Angular Mvd",
        logo: "/images/communities/angular_mvd.webp",
        url: "https://www.meetup.com/angular-mvd/",
      },
      {
        name: "Montevideo JS",
        logo: "/images/communities/montevideo_js.webp",
        url: "https://www.meetup.com/es/montevideojs/",
      },
      {
        name: "Ruby Montevideo",
        logo: "/images/communities/ruby_montevideo.webp",
        url: "https://www.meetup.com/es/ruby-montevideo/",
      },
      {
        name: "AWS UG Montevideo",
        logo: "/images/communities/aws_ug_montevideo.webp",
        url: "https://www.meetup.com/aws-ug-montevideo/",
      },
      {
        name: "Owasp Uruguay",
        logo: "/images/communities/owasp_uruguay.webp",
        url: "https://www.meetup.com/es/owasp-uruguay-chapter/",
      },
      {
        name: "GDG Montevideo",
        logo: "/images/communities/gdg_montevideo.webp",
        url: "https://gdg.community.dev/gdg-montevideo/",
      },
      {
        name: "PHP Montevideo",
        logo: "/images/communities/php_montevideo.webp",
        url: "https://www.meetup.com/es/phpmvd/",
      },
      {
        name: "Data Science UY",
        logo: "/images/communities/data_science_uy.webp",
        url: "https://data-science-uy.github.io/",
      },
      {
        name: "Sysarmy UY",
        logo: "/images/communities/sysarmy_uy.webp",
        url: "https://sysarmy.uy/",
      },
      {
        name: "AI for Devs",
        logo: "/images/communities/ai4devs.webp",
        url: "https://www.meetup.com/ai-for-devs-montevideo/",
      },
      {
        name: "MLOps Uruguay",
        logo: "/images/communities/mlops_uruguay.webp",
        url: "https://www.meetup.com/mlops-uruguay/",
      },
      {
        name: "Python Montevideo",
        logo: "/images/communities/python_mvd.webp",
        url: "https://www.meetup.com/py-mvd/",
      },
      {
        name: "Elixir Montevideo",
        logo: "/images/communities/elixir_mvd.webp",
        url: "https://www.meetup.com/elixir-montevideo/photos/27949971/",
      },
      {
        name: "Web Developers",
        logo: "/images/communities/montevideo_web_developers.webp",
        url: "https://www.meetup.com/montevideo-web-developers/",
      },
    ],
  },
  staff: {
    staffTitle: "Equipo de Organización",
    staffSubtitle: "Personas que organízan el evento",
    staffList: [
      {
        name: "Gabriel Chertok",
        role: "CTO @Ingenious",
        image: "/images/team/gabriel_chertok.webp",
        linkedin: "https://www.linkedin.com/in/cherta",
      },
      {
        name: "Damian Sire",
        role: "Community Dev",
        image: "/images/team/damian_sire.webp",
        linkedin: "https://www.linkedin.com/in/damiansire",
      },
      {
        name: "el cuervo",
        role: "",
        image: "/images/team/elcuervo.webp",
        linkedin: "bruno-aguirre-89191b21a",
      },
      {
        name: "Federico Kauffman",
        role: "CTO at Streaver",
        image: "/images/team/federico_kauffman.webp",
        linkedin: "federico-kauffman",
      },
      {
        name: "Federico Balarini",
        role: "Group Engineering Manager at Xmartlabs",
        image: "/images/team/federico_balarini.webp",
        linkedin: "federico-balarini-933716158",
      },
      {
        name: "Francisco Bergeret",
        role: "Technical Leader @Perficient",
        image: "/images/team/francisco_bergeret.webp",
        linkedin: "franciscobergeret",
      },
      {
        name: "Franco Correa",
        role: "Engineering @RevenueCat.com",
        image: "/images/team/franco_correa.webp",
        linkedin: "franco-correa-1201",
      },
      {
        name: "Itay Brenner",
        role: "iOS Engineer @Emerge Tools",
        image: "/images/team/itay_brenner.webp",
        linkedin: "itaybrenner",
      },
      {
        name: "Kevin Exposito",
        role: "Software Developer @Mimiquate",
        image: "/images/team/kevin_exposito.webp",
        linkedin: "kevinexposito",
      },
      {
        name: "Leticia Esperon",
        role: "Director of Engineering @Village",
        image: "/images/team/leticia_esperon.webp",
        linkedin: "leticia-esperon",
      },
      {
        name: "Marcelo Bagnasco",
        role: "Technical Leader @Endava",
        image: "/images/team/marcelo_bagnasco.webp",
        linkedin: "marcelo-bagnasco",
      },
      {
        name: "Marcelo Dominguez",
        role: "Engineer @Mimiquate",
        image: "/images/team/marcelo_dominguez.webp",
        linkedin: "marpo60",
      },
      {
        name: "Martin Mari",
        role: "Consultor Freelance",
        image: "/images/team/martin_mari.webp",
        linkedin: "martinmari",
      },
      {
        name: "Mauricio Mena",
        role: "Freelance software developer",
        image: "/images/team/mauricio_mena.webp",
        linkedin: "mauricio-mena-7bb13271",
      },
      {
        name: "Mikaela Pisani",
        role: "ML Lead at Rootstrap & Co-Managing Director at Girls in Tech",
        image: "/images/team/mikaela_pisani.webp",
        linkedin: "mikaela-pisani-leal",
      },
      {
        name: "Pablo Marcano",
        role: "Engineering @Constellation",
        image: "/images/team/pablo_marcano.webp",
        linkedin: "pablo-marcano",
      },
      {
        name: "Santiago Ferreira",
        role: "Fotógrafo Amateur y Programador",
        image: "/images/team/santiago_ferreira.webp",
        linkedin: "santiagoferreira",
      },
      {
        name: "Tomas Piaggio",
        role: "Director of Engineering @Very Good Ventures",
        image: "/images/team/tomas_piaggio.webp",
        linkedin: "tomas-piaggio",
      },
      {
        name: "Javier Valenzani",
        role: "Education Lead @holbertonuy",
        image: "/images/team/javier_valenzani.webp",
        linkedin: "jvalenzani",
      },
    ],
  },
  conductCode: {
    conductCodeTitle: "Código de Conducta",
    conductCodeSubtitle: "Te presentamos el Código de Conducta de La Meetup I",
    conductCodeIntroduction:
      "En nuestra meetup, estamos comprometidos a proporcionar un entorno amigable, respetuoso e inclusivo para todas las personas, independientemente de su género, identidad de género y expresión, orientación sexual, discapacidad, apariencia física, tamaño corporal, raza, edad o religión.",
    conductCodeExpectations:
      "Esperamos que todos los participantes sigan estos principios y traten a los demás con respeto y cortesía.",
    conductCodeUnacceptableBehaviors: [
      "Comentarios ofensivos o despectivos, chistes y lenguaje inapropiado.",
      "Acoso, intimidación o comportamiento discriminatorio.",
      "Publicación de información personal de otros sin su consentimiento.",
      "Spam o promoción no deseada.",
      "Cualquier otra conducta que sea perjudicial para el ambiente de la meetup.",
    ],
    conductCodeConsequences:
      "Los organizadores de la meetup se reservan el derecho de tomar medidas disciplinarias apropiadas en respuesta a comportamientos inaceptables. Esto puede incluir advertencias, expulsión de la meetup o prohibición de futuras participaciones.",
    conductCodeParticipationAgreement:
      "Al participar en esta meetup, aceptas seguir este código de conducta y las decisiones de los organizadores.",
    conductCodeScope: "Este código de conducta se aplica a todos los eventos y canales relacionados con la meetup.",
  },
  seo: {
    title: "La Meetup I | OWU Uruguay",
    description:
      "La Meetup I ofrece un espacio para reunirnos en persona y conectar con comunidades de tecnología uruguayas.",
    og: {
      title: "La Meetup I | OWU Uruguay",
      description:
        "La Meetup I ofrece un espacio para reunirnos en persona y conectar con comunidades de tecnología uruguayas.",
      image: "la-meetup-2023.jpg",
    },
  },
};
