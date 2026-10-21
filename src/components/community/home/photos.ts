/*
 * The home page's photo archive: La Meetup II (2024) and III (2025).
 * Room shots are the ones that hold up at the biggest size. Files under
 * /images/la-meetup are 2048px WebP exports without camera or location data.
 */

export const EVENTS = {
  ii: "La Meetup II · Oct 2024",
  iii: "La Meetup III · Nov 2025",
} as const;

export type Photo = {
  src: string;
  alt: string;
  caption: string;
  event: keyof typeof EVENTS;
  room: boolean;
  /** CSS object-position for crops of portrait shots, e.g. "50% 30%" to keep faces in a wide cell */
  focus?: string;
};

const iii = (name: string, caption: string, alt: string, room = false): Photo => ({
  src: `/images/conf/gallery/${name}.webp`,
  caption,
  alt,
  event: "iii",
  room,
});
const ii = (n: number, caption: string, alt: string, room = false): Photo => ({
  src: `/images/2025/intro/${n}.webp`,
  caption,
  alt,
  event: "ii",
  room,
});

/** The photographers' and attendees' photos from both editions, from the original files */
const meetup = (
  year: "2024" | "2025",
  slug: string,
  caption: string,
  alt: string,
  extra: Partial<Photo> = {}
): Photo => ({
  src: `/images/la-meetup/${year}/${slug}.webp`,
  caption,
  alt,
  event: year === "2024" ? "ii" : "iii",
  room: false,
  ...extra,
});

/** The first room shot and the first ten moments are what the wall opens with */
export const PHOTOS: Photo[] = [
  // Full-room shots: the big cell rotates through these
  iii("tangram-1", "Toda la sala", "Toda la sala de La Meetup III con los brazos en alto para la foto grupal", true),
  meetup("2025", "selfie-con-todos", "Una selfie con todos", "Una selfie grupal con decenas de asistentes sonriendo", {
    room: true,
  }),
  meetup(
    "2025",
    "el-lobby-lleno",
    "El lobby, lleno",
    "El lobby de La Meetup III lleno de gente charlando entre sesiones",
    { room: true }
  ),
  ii(8, "La foto grupal de 2024", "Foto grupal de La Meetup II con toda la sala", true),
  meetup(
    "2025",
    "la-gran-ronda",
    "La gran ronda",
    "Toda la gente sentada en una gran ronda de sillones durante el open space",
    { room: true }
  ),
  iii("momento-02", "Sala llena en la apertura", "El público colmando la sala principal durante la apertura", true),
  meetup(
    "2024",
    "el-equipo-y-el-carpincho",
    "El equipo y el carpincho",
    "El equipo organizador de La Meetup II posando en el escenario junto al carpincho",
    { room: true }
  ),
  meetup(
    "2025",
    "sesion-en-el-lounge",
    "Una sesión en el lounge",
    "Decenas de personas en los sillones del lounge siguiendo una sesión del open space",
    { room: true }
  ),
  iii("tangram-2", "La selfie de rigor", "Un grupo de asistentes sacándose una selfie con la sala detrás", true),
  meetup(
    "2025",
    "publico-en-las-gradas",
    "Público en las gradas",
    "Asistentes sentados en las gradas siguiendo la apertura",
    { room: true }
  ),
  ii(4, "La ronda del open space", "Una ronda de gente sentada en círculo armando la grilla del open space", true),
  iii("momento-09", "Los que se quedaron hasta el final", "Foto grupal de los asistentes a La Meetup III", true),
  // Moments: the first ten open the wall
  meetup("2025", "risas-en-ronda", "Risas en ronda", "Un grupo de asistentes riéndose y aplaudiendo en el lobby"),
  iii("momento-15", "El after", "Cuatro asistentes compartiendo una mesa y riéndose durante el after"),
  meetup("2025", "mate-y-consola", "Mate y consola", "El equipo técnico prepara la transmisión, mate en mano"),
  meetup("2025", "reencuentro", "Reencuentro", "Dos asistentes abrazados y sonriendo para la foto"),
  iii("tangram-4", "Entre charlas", "Tres asistentes brindando y riéndose entre charlas"),
  meetup(
    "2025",
    "proponiendo-charlas",
    "Proponiendo charlas",
    "Manos escribiendo propuestas en las tarjetas de charla del open space"
  ),
  meetup(
    "2025",
    "brindis-del-equipo",
    "Brindis del equipo",
    "Cuatro organizadores con la remera de La Meetup brindando en el after"
  ),
  meetup("2025", "stickers-holograficos", "Stickers holográficos", "Stickers holográficos de OWU.UY sobre una mesa"),
  meetup(
    "2025",
    "los-ovillos-de-la-palabra",
    "Los ovillos de la palabra",
    "Un organizador levanta los ovillos de lana con los que se pasa la palabra en el open space"
  ),
  meetup("2025", "amigos-de-la-comunidad", "Amigos de la comunidad", "Cinco asistentes sonriendo juntos en el lobby"),
  meetup("2025", "charla-en-el-after", "Charla en el after", "Dos asistentes riéndose en la barra durante el after"),
  meetup(
    "2024",
    "stickers-del-carpincho",
    "Stickers del carpincho",
    "Decenas de stickers del carpincho de La Meetup sobre una mesa"
  ),
  ii(5, "La entrada es gratis", "Una mano sosteniendo la credencial de La Meetup en la entrada"),
  meetup(
    "2025",
    "pitch-de-una-sesion",
    "El pitch de una sesión",
    "Una asistente presenta su propuesta de sesión con el micrófono en una ronda del open space"
  ),
  meetup("2024", "risas-y-selfie", "Risas y selfie", "Dos asistentes riéndose en una selfie entre la gente"),
  ii(1, "Networking", "Asistentes charlando en grupos en la entrada del venue antes de las charlas"),
  meetup(
    "2025",
    "pulgar-arriba",
    "Pulgar arriba",
    "Un asistente sonriendo con el pulgar arriba y el termo bajo el brazo"
  ),
  meetup(
    "2025",
    "escribiendo-propuestas",
    "Escribiendo propuestas",
    "Asistentes escribiendo sus propuestas de sesión alrededor de una mesa"
  ),
  iii("tangram-6", "Stickers", "La mesa llena de stickers de las comunidades de OWU"),
  meetup(
    "2024",
    "selfie-del-staff",
    "Selfie del staff",
    "Tres organizadoras y organizadores de La Meetup II sonriendo en una selfie",
    { focus: "50% 28%" }
  ),
  meetup("2025", "abrazo", "Un abrazo", "Dos asistentes se abrazan en medio de la gente"),
  ii(3, "La grilla del open space", "La grilla del open space armada con post-its sobre una pizarra"),
  meetup("2025", "manos-arriba", "Manos arriba", "Asistentes levantando la mano frente al escenario de La Meetup III"),
  meetup("2025", "tres-amigos", "Tres amigos", "Tres asistentes abrazados posando para la foto"),
  iii(
    "tangram-7",
    "El equipo que lo hace posible",
    "El equipo organizador celebrando frente al cartel de La Meetup III"
  ),
  meetup(
    "2024",
    "la-grilla-a-mano",
    "La grilla, a mano",
    "Las propuestas del open space escritas a mano y pegadas en el vidrio"
  ),
  meetup(
    "2025",
    "con-el-ovillo-en-la-mano",
    "Con el ovillo en la mano",
    "Un asistente habla con el micrófono y el ovillo de lana en la mano mientras la ronda escucha"
  ),
  iii("momento-13", "Charlas al atardecer", "El público disfrutando del evento al atardecer"),
  meetup("2025", "salud", "¡Salud!", "Dos asistentes brindan con cerveza en el after"),
  meetup(
    "2024",
    "selfie-de-amigas",
    "Selfie de amigas",
    "Tres asistentes sonriendo en una selfie con la ciudad de fondo"
  ),
  iii("momento-26", "Charla de pasillo", "Asistentes conversando en los sillones durante la pausa"),
  meetup(
    "2025",
    "la-grilla-en-vivo",
    "La grilla en vivo",
    "El facilitador señala en la pantalla la grilla del open space"
  ),
  meetup("2025", "risas-en-el-sillon", "Risas en el sillón", "Dos asistentes riéndose sentados en un sillón"),
  iii("momento-20", "Charla a dúo", "Dúo de speakers presentando su charla en comunidad"),
  meetup(
    "2025",
    "detras-de-escena",
    "Detrás de escena",
    "Un voluntario opera la consola de transmisión durante las charlas"
  ),
  meetup("2025", "organizadores", "Organizadores", "Dos organizadores con la remera de La Meetup III sonriendo"),
  iii("tangram-5", "Speakers de la comunidad", "Una speaker sonriendo frente a la pantalla de su charla"),
  meetup(
    "2024",
    "una-propuesta-en-el-piso",
    "Una propuesta, en el piso",
    "Una asistente escribe su propuesta de sesión arrodillada en el piso",
    { focus: "50% 62%" }
  ),
  meetup("2025", "con-el-microfono", "Con el micrófono", "Un asistente habla con el micrófono durante una sesión"),
  iii("momento-12", "Stickers para todos", "Mesa de acreditación con stickers de la comunidad"),
  meetup(
    "2025",
    "stickers-de-las-comunidades",
    "Stickers de las comunidades",
    "Stickers de las comunidades de OWU sobre la mesa"
  ),
  meetup(
    "2025",
    "after-al-aire-libre",
    "After al aire libre",
    "Asistentes riéndose con cervezas afuera del bar del after"
  ),
  iii("momento-30", "Networking afuera", "Grupos de asistentes charlando de pie en las afueras del venue"),
  meetup(
    "2025",
    "foto-de-grupo",
    "Foto de grupo",
    "Un grupo de asistentes posa en los sillones mientras alguien les saca una foto"
  ),
  meetup(
    "2024",
    "frente-a-la-pantalla",
    "Frente a la pantalla",
    "Dos asistentes sonriendo en una selfie frente a la pantalla de La Meetup 2024"
  ),
  iii("momento-14", "El equipo", "El equipo organizador celebrando sobre el escenario"),
  meetup("2025", "el-coffee-break", "El coffee break", "Gente en la mesa del coffee break"),
  meetup(
    "2025",
    "con-la-credencial",
    "Con la credencial",
    "Asistentes mostrando sus credenciales en una selfie grupal"
  ),
  iii("momento-16", "La foto del equipo", "El equipo organizador en la foto final del evento"),
  meetup("2025", "ronda-en-los-puf", "Ronda en los puf", "Una sesión del open space en ronda sobre puf amarillos"),
  meetup("2025", "manos-al-centro", "Manos al centro", "Las manos del equipo juntas en el centro de una ronda"),
  iii("momento-18", "Open space en pantalla", "El tablero del open space proyectado en pantalla"),
  meetup(
    "2025",
    "palabras-de-cierre",
    "Palabras de cierre",
    "Las organizadoras cierran el evento frente al logo de OWU.UY en la pantalla"
  ),
  meetup(
    "2025",
    "risas-en-la-mesa-de-stickers",
    "Risas en la mesa de stickers",
    "Dos asistentes riéndose junto a la mesa de stickers"
  ),
  iii("momento-28", "Dos speakers, un escenario", "Dos speakers compartiendo el escenario"),
  iii("momento-29", "Las charlas de la tarde", "El público siguiendo las charlas de la tarde"),
  iii("momento-04", "Público atento", "Asistentes siguiendo una charla con atención"),
  iii("momento-19", "A puro micrófono", "Un speaker a puro micrófono sobre el escenario"),
  iii("momento-22", "Charla sobre bioimplantes", "Charla sobre bioimplantes con visuales en pantalla"),
  iii("momento-06", "El cierre", "Cierre del evento con el logo de OWU en pantalla"),
  iii("momento-01", "La apertura", "Charla de apertura en el escenario principal de La Meetup III"),
  iii("momento-07", "Sobre el escenario", "Presentación en el escenario de La Meetup III"),
  iii("momento-08", "Mercado de ideas", "Facilitación del Mercado de Ideas en el escenario"),
  iii("momento-17", "Desde el podio", "Una speaker abriendo su charla desde el podio"),
  iii("momento-21", "Presentando", "Presentación de una charla desde el podio de speakers"),
  ii(7, "Owy en escena", "Un speaker en el escenario de La Meetup II junto al globo de Owy"),
  ii(6, "Owy, la mascota", "Owy, la mascota de OWU, flotando sobre el escenario de La Meetup II"),
  ii(9, "El equipo de 2024", "El equipo organizador abrazado frente al cartel de La Meetup"),
  iii("tangram-3", "Desde el escenario", "Un speaker señalando la pantalla durante su charla"),
  iii("momento-05", "Preguntas del público", "El público participando de una sesión"),
];

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** owu-la-meetup-iii-el-after.webp */
export const fileName = (photo: Photo) =>
  `owu-${slug(EVENTS[photo.event].split(" · ")[0]!)}-${slug(photo.caption)}.webp`;
