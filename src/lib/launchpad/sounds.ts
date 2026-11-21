/**
 * The launchpad sound bank (files under public/sounds). Shared by the
 * launchpad page (icons live there), the OBS cue editor and the server, which
 * fires a sound as part of a cue by publishing `play_sound` on the launchpad
 * channel — the same event a controller device sends.
 *
 * Ids are stable (OBS cues store them); the order is the pads' order. Every file
 * goes through scripts/launchpad-sound.mjs (one take, no dead air before the
 * sound, -16 LUFS), which also prints its `seconds`. The sounds added in 2026
 * (ids 43–62) are CC0, from Freesound.
 */
export const SOUND_GROUPS = {
  publico: "Público",
  momentos: "Momentos",
  memes: "Memes",
  efectos: "Efectos",
} as const;

export type SoundGroup = keyof typeof SOUND_GROUPS;

export const SOUNDS = [
  { id: "43", name: "Aplausos", audioFile: "/sounds/applause.mp3", group: "publico", seconds: 6.6 },
  { id: "44", name: "Ovación", audioFile: "/sounds/cheer.mp3", group: "publico", seconds: 7.9 },
  { id: "9", name: "Risas", audioFile: "/sounds/laugh.mp3", group: "publico", seconds: 5.5 },
  { id: "57", name: "¡Uhhh!", audioFile: "/sounds/crowd-ooh.mp3", group: "publico", seconds: 2.4 },
  { id: "58", name: "Awww", audioFile: "/sounds/aww.mp3", group: "publico", seconds: 2 },
  { id: "24", name: "Wow", audioFile: "/sounds/wow.mp3", group: "publico", seconds: 1.7 },
  { id: "45", name: "Grillos", audioFile: "/sounds/crickets.mp3", group: "publico", seconds: 7.2 },

  { id: "7", name: "Redoble", audioFile: "/sounds/drum-roll.mp3", group: "momentos", seconds: 2.4 },
  { id: "51", name: "Ta-da", audioFile: "/sounds/tada.mp3", group: "momentos", seconds: 1.7 },
  { id: "5", name: "Festejo", audioFile: "/sounds/celebration.mp3", group: "momentos", seconds: 0.8 },
  { id: "50", name: "Gong", audioFile: "/sounds/gong.mp3", group: "momentos", seconds: 5 },
  { id: "56", name: "Campana de boxeo", audioFile: "/sounds/boxing-bell.mp3", group: "momentos", seconds: 2.5 },
  { id: "60", name: "Cuenta regresiva", audioFile: "/sounds/countdown.mp3", group: "momentos", seconds: 3.5 },
  { id: "55", name: "Tic tac", audioFile: "/sounds/clock-ticking.mp3", group: "momentos", seconds: 7.9 },
  { id: "48", name: "Correcto", audioFile: "/sounds/correct.mp3", group: "momentos", seconds: 0.9 },
  { id: "49", name: "Incorrecto", audioFile: "/sounds/wrong.mp3", group: "momentos", seconds: 1.1 },
  { id: "54", name: "Caja registradora", audioFile: "/sounds/cash-register.mp3", group: "momentos", seconds: 1.9 },
  { id: "52", name: "Dun dun duuun", audioFile: "/sounds/dun-dun-dun.mp3", group: "momentos", seconds: 5.1 },
  { id: "62", name: "Level up", audioFile: "/sounds/level-up.mp3", group: "momentos", seconds: 1.7 },
  { id: "37", name: "Despegue", audioFile: "/sounds/takeoff.mp3", group: "momentos", seconds: 2.4 },
  { id: "1", name: "Bass drop", audioFile: "/sounds/bass-drop.mp3", group: "momentos", seconds: 7.5 },
  { id: "19", name: "Logo tech", audioFile: "/sounds/tech-logo.mp3", group: "momentos", seconds: 3.5 },

  { id: "14", name: "Ba dum tss", audioFile: "/sounds/rimshot.mp3", group: "memes", seconds: 1.7 },
  { id: "46", name: "Trombón triste", audioFile: "/sounds/sad-trombone.mp3", group: "memes", seconds: 4.8 },
  { id: "47", name: "Bocina", audioFile: "/sounds/air-horn.mp3", group: "memes", seconds: 1.6 },
  { id: "27", name: "Bruh", audioFile: "/sounds/bruh.mp3", group: "memes", seconds: 0.7 },
  { id: "61", name: "Bonk", audioFile: "/sounds/bonk.mp3", group: "memes", seconds: 0.4 },
  { id: "59", name: "Mic drop", audioFile: "/sounds/mic-drop.mp3", group: "memes", seconds: 1.5 },
  { id: "53", name: "Rayón de disco", audioFile: "/sounds/record-scratch.mp3", group: "memes", seconds: 1.4 },
  { id: "10", name: "No, no, no", audioFile: "/sounds/no-no-no.mp3", group: "memes", seconds: 2.7 },
  { id: "32", name: "Error XP", audioFile: "/sounds/error-xp.mp3", group: "memes", seconds: 0.9 },
  { id: "39", name: "Error XP remix", audioFile: "/sounds/error-xp-remix.mp3", group: "memes", seconds: 28.1 },
  { id: "35", name: "Final de meme", audioFile: "/sounds/meme-end.mp3", group: "memes", seconds: 10.1 },
  { id: "33", name: "Goofy corriendo", audioFile: "/sounds/goofy-run.mp3", group: "memes", seconds: 1.7 },
  { id: "34", name: "El rey león", audioFile: "/sounds/lion-king.mp3", group: "memes", seconds: 7.9 },
  { id: "26", name: "Transición Batman", audioFile: "/sounds/batman-transition.mp3", group: "memes", seconds: 1.5 },
  { id: "29", name: "Developers", audioFile: "/sounds/developers.mp3", group: "memes", seconds: 3.1 },
  { id: "40", name: "Gurice", audioFile: "/sounds/uy-gurice.mp3", group: "memes", seconds: 1.4 },
  { id: "41", name: "Inodoro", audioFile: "/sounds/inodoro.mp3", group: "memes", seconds: 6.6 },
  { id: "42", name: "Ascensor", audioFile: "/sounds/ascensor.mp3", group: "memes", seconds: 2 },
  { id: "25", name: "Risa de ardilla", audioFile: "/sounds/squirrel-laugh.mp3", group: "memes", seconds: 2 },
  { id: "38", name: "Violín desafinado", audioFile: "/sounds/violin-screech.mp3", group: "memes", seconds: 3.6 },
  { id: "36", name: "Amenaza detectada", audioFile: "/sounds/threat-detected.mp3", group: "memes", seconds: 3 },
  { id: "28", name: "Persecución", audioFile: "/sounds/chase.mp3", group: "memes", seconds: 16.1 },
  { id: "30", name: "Corte de DJ", audioFile: "/sounds/dj-stop.mp3", group: "memes", seconds: 0.8 },
  { id: "8", name: "Hola", audioFile: "/sounds/hi.mp3", group: "memes", seconds: 1 },
  { id: "22", name: "Voz", audioFile: "/sounds/vocal.mp3", group: "memes", seconds: 1.2 },
  { id: "12", name: "Pop wow", audioFile: "/sounds/pop-wow.mp3", group: "memes", seconds: 2.5 },

  { id: "3", name: "Boing 1", audioFile: "/sounds/boing-1.mp3", group: "efectos", seconds: 1.5 },
  { id: "4", name: "Boing 2", audioFile: "/sounds/boing-2.mp3", group: "efectos", seconds: 2.3 },
  { id: "23", name: "Boing 3", audioFile: "/sounds/boing-3.mp3", group: "efectos", seconds: 3.5 },
  { id: "31", name: "Patito de goma", audioFile: "/sounds/duck-toy.mp3", group: "efectos", seconds: 0.8 },
  { id: "13", name: "Pop", audioFile: "/sounds/pop.mp3", group: "efectos", seconds: 0.1 },
  { id: "6", name: "Clic", audioFile: "/sounds/click.mp3", group: "efectos", seconds: 0.4 },
  { id: "16", name: "Interruptor", audioFile: "/sounds/switch.mp3", group: "efectos", seconds: 0.4 },
  { id: "17", name: "Swoosh", audioFile: "/sounds/swoosh.mp3", group: "efectos", seconds: 11.5 },
  { id: "18", name: "Ráfaga tech", audioFile: "/sounds/tech-burst.mp3", group: "efectos", seconds: 0.4 },
  { id: "20", name: "Interfaz futurista", audioFile: "/sounds/ui-futuristic.mp3", group: "efectos", seconds: 1.6 },
  { id: "21", name: "Interfaz tech", audioFile: "/sounds/ui-tech.mp3", group: "efectos", seconds: 1.9 },
  { id: "11", name: "Notificación", audioFile: "/sounds/notification.mp3", group: "efectos", seconds: 1.9 },
  { id: "15", name: "Robot", audioFile: "/sounds/robot.mp3", group: "efectos", seconds: 2.4 },
  { id: "2", name: "Pájaros", audioFile: "/sounds/birds.mp3", group: "efectos", seconds: 19.1 },
] as const satisfies readonly { id: string; name: string; audioFile: string; group: SoundGroup; seconds: number }[];

export type SoundId = (typeof SOUNDS)[number]["id"];
export type Sound = (typeof SOUNDS)[number];

export function findSound(id: string) {
  return SOUNDS.find((sound) => sound.id === id);
}

/** Payload of the launchpad `play_sound` event (volume 0–100). */
export function soundEvent(id: string) {
  const sound = findSound(id);
  if (!sound) return null;

  return { soundId: sound.id, audioFile: sound.audioFile, volume: 100, timestamp: Date.now() };
}
