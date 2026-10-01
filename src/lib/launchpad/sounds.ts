/**
 * The launchpad sound bank (files under public/sounds). Shared by the
 * launchpad page (icons live there), the OBS cue editor and the server, which
 * fires a sound as part of a cue by publishing `play_sound` on the launchpad
 * channel — the same event a controller device sends.
 */
export const SOUNDS = [
  { id: "1", name: "Bass Drop", audioFile: "/sounds/bass-drop.mp3" },
  { id: "2", name: "Birds", audioFile: "/sounds/birds.mp3" },
  { id: "3", name: "Boing 1", audioFile: "/sounds/boing-1.mp3" },
  { id: "4", name: "Boing 2", audioFile: "/sounds/boing-2.mp3" },
  { id: "5", name: "Celebration", audioFile: "/sounds/celebration.mp3" },
  { id: "6", name: "Click", audioFile: "/sounds/click.mp3" },
  { id: "7", name: "Drum Roll", audioFile: "/sounds/drum-roll.mp3" },
  { id: "8", name: "Hi", audioFile: "/sounds/hi.mp3" },
  { id: "9", name: "Laugh", audioFile: "/sounds/laugh.mp3" },
  { id: "10", name: "No No No", audioFile: "/sounds/no-no-no.mp3" },
  { id: "11", name: "Notification", audioFile: "/sounds/notification.mp3" },
  { id: "12", name: "Pop Wow", audioFile: "/sounds/pop-wow.mp3" },
  { id: "13", name: "Pop", audioFile: "/sounds/pop.mp3" },
  { id: "14", name: "Rimshot", audioFile: "/sounds/rimshot.mp3" },
  { id: "15", name: "Robot", audioFile: "/sounds/robot.mp3" },
  { id: "16", name: "Switch", audioFile: "/sounds/switch.mp3" },
  { id: "17", name: "Swoosh", audioFile: "/sounds/swoosh.mp3" },
  { id: "18", name: "Tech Burst", audioFile: "/sounds/tech-burst.mp3" },
  { id: "19", name: "Tech Logo", audioFile: "/sounds/tech-logo.mp3" },
  { id: "20", name: "UI Futuristic", audioFile: "/sounds/ui-futuristic.mp3" },
  { id: "21", name: "UI Tech", audioFile: "/sounds/ui-tech.mp3" },
  { id: "22", name: "Vocal", audioFile: "/sounds/vocal.mp3" },
  { id: "23", name: "Boing 3", audioFile: "/sounds/boing-3.mp3" },
  { id: "24", name: "Wow", audioFile: "/sounds/wow.mp3" },
  { id: "25", name: "Squirrel Laugh", audioFile: "/sounds/squirrel-laugh.mp3" },
  { id: "26", name: "Batman Transition", audioFile: "/sounds/batman-transition.mp3" },
  { id: "27", name: "Bruh", audioFile: "/sounds/bruh.mp3" },
  { id: "28", name: "Chase", audioFile: "/sounds/chase.mp3" },
  { id: "29", name: "Developers", audioFile: "/sounds/developers.mp3" },
  { id: "30", name: "DJ Stop", audioFile: "/sounds/dj-stop.mp3" },
  { id: "31", name: "Duck Toy", audioFile: "/sounds/duck-toy.mp3" },
  { id: "32", name: "Error XP", audioFile: "/sounds/error-xp.mp3" },
  { id: "33", name: "Goofy Run", audioFile: "/sounds/goofy-run.mp3" },
  { id: "34", name: "Lion King", audioFile: "/sounds/lion-king.mp3" },
  { id: "35", name: "Meme End", audioFile: "/sounds/meme-end.mp3" },
  { id: "36", name: "Threat Detected", audioFile: "/sounds/threat-detected.mp3" },
  { id: "37", name: "Takeoff", audioFile: "/sounds/takeoff.mp3" },
  { id: "38", name: "Violin Screech", audioFile: "/sounds/violin-screech.mp3" },
  { id: "39", name: "Error XP Remix", audioFile: "/sounds/error-xp-remix.mp3" },
  { id: "40", name: "Gurice", audioFile: "/sounds/uy-gurice.mp3" },
  { id: "41", name: "Inodoro", audioFile: "/sounds/inodoro.mp3" },
  { id: "42", name: "Ascensor", audioFile: "/sounds/ascensor.mp3" },
] as const;

export type SoundId = (typeof SOUNDS)[number]["id"];

export function findSound(id: string) {
  return SOUNDS.find((sound) => sound.id === id);
}

/** Payload of the launchpad `play_sound` event (volume 0–100). */
export function soundEvent(id: string) {
  const sound = findSound(id);
  if (!sound) return null;

  return { soundId: sound.id, audioFile: sound.audioFile, volume: 100, timestamp: Date.now() };
}
