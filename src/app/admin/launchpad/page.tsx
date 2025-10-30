"use client";

import type React from "react";
import { useState, useRef } from "react";
import { Button } from "components/shared/ui/button";
import { Card, CardContent } from "components/shared/ui/card";
import { Slider } from "components/shared/ui/slider";
import {
  Volume2,
  VolumeX,
  Music,
  Laugh,
  Drum,
  PartyPopper,
  Sparkles,
  Bird,
  ThumbsDown,
  HandMetal,
  Disc,
  ThumbsUp,
  Smile,
  Bell,
  CircleDot,
  Bot,
  MousePointer,
  MoveUp,
  Zap,
  Radio,
  MonitorPlay,
  ToggleLeft,
  Layers,
  Squirrel,
  Clapperboard,
  MessageSquare,
  PlaySquare,
  Code2,
  Pause,
  Sandwich,
  AlertTriangle,
  BusFront,
  Crown,
  Film,
  ShieldAlert,
  Rocket,
  Music4,
  Megaphone,
} from "lucide-react";

interface SoundButton {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  audioFile: string;
}

const SOUND_BUTTONS: SoundButton[] = [
  {
    id: "1",
    name: "Bass Drop",
    icon: Layers,
    audioFile: "/sounds/bass-drop.mp3",
  },
  {
    id: "2",
    name: "Birds",
    icon: Bird,
    audioFile: "/sounds/birds.mp3",
  },
  {
    id: "3",
    name: "Boing 1",
    icon: Sparkles,
    audioFile: "/sounds/boing-1.mp3",
  },
  {
    id: "4",
    name: "Boing 2",
    icon: Sparkles,
    audioFile: "/sounds/boing-2.mp3",
  },
  {
    id: "5",
    name: "Celebration",
    icon: PartyPopper,
    audioFile: "/sounds/celebration.mp3",
  },
  {
    id: "6",
    name: "Click",
    icon: MousePointer,
    audioFile: "/sounds/click.mp3",
  },
  {
    id: "7",
    name: "Drum Roll",
    icon: Drum,
    audioFile: "/sounds/drum-roll.mp3",
  },
  {
    id: "8",
    name: "Hi",
    icon: HandMetal,
    audioFile: "/sounds/hi.mp3",
  },
  {
    id: "9",
    name: "Laugh",
    icon: Laugh,
    audioFile: "/sounds/laugh.mp3",
  },
  {
    id: "10",
    name: "No No No",
    icon: ThumbsDown,
    audioFile: "/sounds/no-no-no.mp3",
  },
  {
    id: "11",
    name: "Notification",
    icon: Bell,
    audioFile: "/sounds/notification.mp3",
  },
  {
    id: "12",
    name: "Pop Wow",
    icon: Music,
    audioFile: "/sounds/pop-wow.mp3",
  },
  {
    id: "13",
    name: "Pop",
    icon: Disc,
    audioFile: "/sounds/pop.mp3",
  },
  {
    id: "14",
    name: "Rimshot",
    icon: CircleDot,
    audioFile: "/sounds/rimshot.mp3",
  },
  {
    id: "15",
    name: "Robot",
    icon: Bot,
    audioFile: "/sounds/robot.mp3",
  },
  {
    id: "16",
    name: "Switch",
    icon: ToggleLeft,
    audioFile: "/sounds/switch.mp3",
  },
  {
    id: "17",
    name: "Swoosh",
    icon: MoveUp,
    audioFile: "/sounds/swoosh.mp3",
  },
  {
    id: "18",
    name: "Tech Burst",
    icon: Zap,
    audioFile: "/sounds/tech-burst.mp3",
  },
  {
    id: "19",
    name: "Tech Logo",
    icon: Music,
    audioFile: "/sounds/tech-logo.mp3",
  },
  {
    id: "20",
    name: "UI Futuristic",
    icon: Radio,
    audioFile: "/sounds/ui-futuristic.mp3",
  },
  {
    id: "21",
    name: "UI Tech",
    icon: MonitorPlay,
    audioFile: "/sounds/ui-tech.mp3",
  },
  {
    id: "22",
    name: "Vocal",
    icon: Smile,
    audioFile: "/sounds/vocal.mp3",
  },
  {
    id: "23",
    name: "Boing 3",
    icon: Sparkles,
    audioFile: "/sounds/boing-3.mp3",
  },
  {
    id: "24",
    name: "Wow",
    icon: ThumbsUp,
    audioFile: "/sounds/wow.mp3",
  },
  {
    id: "25",
    name: "Squirrel Laugh",
    icon: Squirrel,
    audioFile: "/sounds/squirrel-laugh.mp3",
  },
  {
    id: "26",
    name: "Batman Transition",
    icon: Clapperboard,
    audioFile: "/sounds/batman-transition.mp3",
  },
  {
    id: "27",
    name: "Bruh",
    icon: MessageSquare,
    audioFile: "/sounds/bruh.mp3",
  },
  {
    id: "28",
    name: "Chase",
    icon: BusFront,
    audioFile: "/sounds/chase.mp3",
  },
  {
    id: "29",
    name: "Developers",
    icon: Code2,
    audioFile: "/sounds/developers.mp3",
  },
  {
    id: "30",
    name: "DJ Stop",
    icon: Pause,
    audioFile: "/sounds/dj-stop.mp3",
  },
  {
    id: "31",
    name: "Duck Toy",
    icon: Sandwich,
    audioFile: "/sounds/duck-toy.mp3",
  },
  {
    id: "32",
    name: "Error XP",
    icon: AlertTriangle,
    audioFile: "/sounds/error-xp.mp3",
  },
  {
    id: "33",
    name: "Goofy Run",
    icon: PlaySquare,
    audioFile: "/sounds/goofy-run.mp3",
  },
  {
    id: "34",
    name: "Lion King",
    icon: Crown,
    audioFile: "/sounds/lion-king.mp3",
  },
  {
    id: "35",
    name: "Meme End",
    icon: Film,
    audioFile: "/sounds/meme-end.mp3",
  },
  {
    id: "36",
    name: "Threat Detected",
    icon: ShieldAlert,
    audioFile: "/sounds/threat-detected.mp3",
  },
  {
    id: "37",
    name: "Takeoff",
    icon: Rocket,
    audioFile: "/sounds/takeoff.mp3",
  },
  {
    id: "38",
    name: "Violin Screech",
    icon: Music4,
    audioFile: "/sounds/violin-screech.mp3",
  },
  {
    id: "39",
    name: "Error XP Remix",
    icon: AlertTriangle,
    audioFile: "/sounds/error-xp-remix.mp3",
  },
  {
    id: "40",
    name: "Gurice",
    icon: Megaphone,
    audioFile: "/sounds/uy-gurice.mp3",
  },
];

export default function LaunchpadPage() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});

  const playSound = (button: SoundButton) => {
    if (isMuted) return;

    // Stop all other sounds first
    Object.keys(audioRefs.current).forEach((key) => {
      if (key !== button.id && audioRefs.current[key]) {
        audioRefs.current[key]!.pause();
        audioRefs.current[key]!.currentTime = 0;
      }
    });

    // Get or create audio element
    if (!audioRefs.current[button.id]) {
      audioRefs.current[button.id] = new Audio(button.audioFile);
    }

    const audio = audioRefs.current[button.id];
    if (!audio) return;

    // If already playing, stop it
    if (playingId === button.id) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingId(null);
      return;
    }

    // Set volume and play the sound
    audio.volume = volume / 100;
    audio.currentTime = 0;
    setPlayingId(button.id);

    audio.play().catch((error) => {
      console.error("Error playing audio:", error);
      setPlayingId(null);
    });

    audio.onended = () => {
      setPlayingId(null);
    };
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      // Stop all sounds when muting
      Object.values(audioRefs.current).forEach((audio) => {
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
      setPlayingId(null);
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-zinc-950 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Launchpad</h1>
            <p className="text-zinc-400">Control de sonidos del evento</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Volume Slider */}
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 text-zinc-400" />
              <Slider
                value={[volume]}
                onValueChange={(value) => setVolume(value[0])}
                max={100}
                step={1}
                className="w-32"
                aria-label="Volume control"
              />
              <span className="min-w-[3ch] text-sm text-zinc-400">{volume}%</span>
            </div>

            {/* Mute Button */}
            <Button
              variant={isMuted ? "destructive" : "outline"}
              size="lg"
              onClick={toggleMute}
              className={`transition-all ${!isMuted ? "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black" : ""}`}
            >
              {isMuted ? (
                <>
                  <VolumeX className="mr-2 h-5 w-5" />
                  Silenciado
                </>
              ) : (
                <>
                  <Volume2 className="mr-2 h-5 w-5" />
                  Activo
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Sound Buttons Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {SOUND_BUTTONS.map((button) => {
            const Icon = button.icon;
            const isPlaying = playingId === button.id;

            return (
              <Card
                key={button.id}
                className={`group relative cursor-pointer border transition-all duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  isPlaying
                    ? "border-yellow-500 bg-zinc-800 shadow-lg shadow-yellow-500/20"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                } ${isMuted ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => playSound(button)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    playSound(button);
                  }
                }}
                tabIndex={isMuted ? -1 : 0}
                role="button"
                aria-label={`Play ${button.name} sound`}
                aria-pressed={isPlaying}
                aria-disabled={isMuted}
              >
                <CardContent className="flex flex-col items-center justify-center p-6">
                  {/* Icon */}
                  <div className="mb-3 transition-transform group-hover:scale-110">
                    <Icon
                      className={`h-10 w-10 transition-colors md:h-12 md:w-12 ${
                        isPlaying ? "text-yellow-400" : "text-zinc-400 group-hover:text-white"
                      }`}
                    />
                  </div>

                  {/* Button Name */}
                  <div
                    className={`text-center text-sm font-medium transition-colors ${
                      isPlaying ? "text-yellow-400" : "text-white"
                    }`}
                  >
                    {button.name}
                  </div>

                  {/* Playing Indicator */}
                  {isPlaying && (
                    <>
                      <div className="absolute right-2 top-2 h-2 w-2 animate-ping rounded-full bg-yellow-500" />
                      <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-yellow-500" />
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
