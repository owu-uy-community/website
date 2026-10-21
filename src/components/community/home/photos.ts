/*
 * The home page's photo archive: La Meetup II (2024) and III (2025).
 * Room shots are the ones that hold up at the biggest size.
 */

export const EVENTS = {
  ii: "La Meetup II · Oct 2024",
  iii: "La Meetup III · Nov 2025",
} as const;

export type Photo = { src: string; alt: string; caption: string; event: keyof typeof EVENTS; room: boolean };

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

/** The first room shot and the first ten moments are what the wall opens with */
export const PHOTOS: Photo[] = [
  iii("tangram-1", "Toda la sala", "Toda la sala de La Meetup III con los brazos en alto para la foto grupal", true),
  iii("momento-15", "El after", "Cuatro asistentes compartiendo una mesa y riéndose durante el after"),
  iii("tangram-4", "Entre charlas", "Tres asistentes brindando y riéndose entre charlas"),
  ii(5, "La entrada es gratis", "Una mano sosteniendo la credencial de La Meetup en la entrada"),
  ii(1, "Networking", "Asistentes charlando en grupos en la entrada del venue antes de las charlas"),
  iii("tangram-6", "Stickers", "La mesa llena de stickers de las comunidades de OWU"),
  ii(3, "La grilla del open space", "La grilla del open space armada con post-its sobre una pizarra"),
  iii("tangram-7", "El equipo que lo hace posible", "El equipo organizador celebrando frente al cartel de La Meetup III"),
  iii("momento-13", "Charlas al atardecer", "El público disfrutando del evento al atardecer"),
  iii("momento-26", "Charla de pasillo", "Asistentes conversando en los sillones durante la pausa"),
  iii("momento-20", "Charla a dúo", "Dúo de speakers presentando su charla en comunidad"),
  ii(8, "La foto grupal de 2024", "Foto grupal de La Meetup II con toda la sala", true),
  iii("tangram-5", "Speakers de la comunidad", "Una speaker sonriendo frente a la pantalla de su charla"),
  iii("momento-12", "Stickers para todos", "Mesa de acreditación con stickers de la comunidad"),
  iii("momento-02", "Sala llena en la apertura", "El público colmando la sala principal durante la apertura", true),
  iii("momento-30", "Networking afuera", "Grupos de asistentes charlando de pie en las afueras del venue"),
  iii("momento-14", "El equipo", "El equipo organizador celebrando sobre el escenario"),
  iii("tangram-2", "La selfie de rigor", "Un grupo de asistentes sacándose una selfie con la sala detrás", true),
  iii("momento-16", "La foto del equipo", "El equipo organizador en la foto final del evento"),
  iii("momento-18", "Open space en pantalla", "El tablero del open space proyectado en pantalla"),
  ii(4, "La ronda del open space", "Una ronda de gente sentada en círculo armando la grilla del open space", true),
  iii("momento-28", "Dos speakers, un escenario", "Dos speakers compartiendo el escenario"),
  iii("momento-29", "Las charlas de la tarde", "El público siguiendo las charlas de la tarde"),
  iii("momento-04", "Público atento", "Asistentes siguiendo una charla con atención"),
  iii("momento-19", "A puro micrófono", "Un speaker a puro micrófono sobre el escenario"),
  iii("momento-09", "Los que se quedaron hasta el final", "Foto grupal de los asistentes a La Meetup III", true),
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
export const fileName = (photo: Photo) => `owu-${slug(EVENTS[photo.event].split(" · ")[0]!)}-${slug(photo.caption)}.webp`;
