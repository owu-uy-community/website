"use client";

/**
 * Launchpad - Remote Sound Control System
 *
 * Professional audio control system for events with dual-mode operation:
 *
 * OUTPUT MODE: Devices play sounds locally and respond to remote triggers
 * CONTROLLER MODE: Devices send commands to output devices via real-time sync
 *
 * Features:
 * - Real-time bidirectional synchronization via Supabase
 * - State persistence and recovery
 * - Multi-device coordination
 * - Mobile-responsive UI
 */

import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "components/shared/ui/button";
import { Card, CardContent } from "components/shared/ui/card";
import { Slider } from "components/shared/ui/slider";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeBroadcast } from "../../../hooks/useRealtimeBroadcast";
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
  Speaker,
  Bath,
} from "lucide-react";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface SoundButton {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  audioFile: string;
}

interface SoundPlayPayload {
  soundId: string;
  audioFile: string;
  volume: number;
  timestamp: number;
}

interface SoundStatePayload {
  playingId: string | null;
  timestamp: number;
}

interface StateRequestPayload {
  requesterId: string;
  timestamp: number;
}

interface StateResponsePayload {
  playingId: string | null;
  volume: number;
  timestamp: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOUND_BUTTONS: SoundButton[] = [
  { id: "1", name: "Bass Drop", icon: Layers, audioFile: "/sounds/bass-drop.mp3" },
  { id: "2", name: "Birds", icon: Bird, audioFile: "/sounds/birds.mp3" },
  { id: "3", name: "Boing 1", icon: Sparkles, audioFile: "/sounds/boing-1.mp3" },
  { id: "4", name: "Boing 2", icon: Sparkles, audioFile: "/sounds/boing-2.mp3" },
  { id: "5", name: "Celebration", icon: PartyPopper, audioFile: "/sounds/celebration.mp3" },
  { id: "6", name: "Click", icon: MousePointer, audioFile: "/sounds/click.mp3" },
  { id: "7", name: "Drum Roll", icon: Drum, audioFile: "/sounds/drum-roll.mp3" },
  { id: "8", name: "Hi", icon: HandMetal, audioFile: "/sounds/hi.mp3" },
  { id: "9", name: "Laugh", icon: Laugh, audioFile: "/sounds/laugh.mp3" },
  { id: "10", name: "No No No", icon: ThumbsDown, audioFile: "/sounds/no-no-no.mp3" },
  { id: "11", name: "Notification", icon: Bell, audioFile: "/sounds/notification.mp3" },
  { id: "12", name: "Pop Wow", icon: Music, audioFile: "/sounds/pop-wow.mp3" },
  { id: "13", name: "Pop", icon: Disc, audioFile: "/sounds/pop.mp3" },
  { id: "14", name: "Rimshot", icon: CircleDot, audioFile: "/sounds/rimshot.mp3" },
  { id: "15", name: "Robot", icon: Bot, audioFile: "/sounds/robot.mp3" },
  { id: "16", name: "Switch", icon: ToggleLeft, audioFile: "/sounds/switch.mp3" },
  { id: "17", name: "Swoosh", icon: MoveUp, audioFile: "/sounds/swoosh.mp3" },
  { id: "18", name: "Tech Burst", icon: Zap, audioFile: "/sounds/tech-burst.mp3" },
  { id: "19", name: "Tech Logo", icon: Music, audioFile: "/sounds/tech-logo.mp3" },
  { id: "20", name: "UI Futuristic", icon: Radio, audioFile: "/sounds/ui-futuristic.mp3" },
  { id: "21", name: "UI Tech", icon: MonitorPlay, audioFile: "/sounds/ui-tech.mp3" },
  { id: "22", name: "Vocal", icon: Smile, audioFile: "/sounds/vocal.mp3" },
  { id: "23", name: "Boing 3", icon: Sparkles, audioFile: "/sounds/boing-3.mp3" },
  { id: "24", name: "Wow", icon: ThumbsUp, audioFile: "/sounds/wow.mp3" },
  { id: "25", name: "Squirrel Laugh", icon: Squirrel, audioFile: "/sounds/squirrel-laugh.mp3" },
  { id: "26", name: "Batman Transition", icon: Clapperboard, audioFile: "/sounds/batman-transition.mp3" },
  { id: "27", name: "Bruh", icon: MessageSquare, audioFile: "/sounds/bruh.mp3" },
  { id: "28", name: "Chase", icon: BusFront, audioFile: "/sounds/chase.mp3" },
  { id: "29", name: "Developers", icon: Code2, audioFile: "/sounds/developers.mp3" },
  { id: "30", name: "DJ Stop", icon: Pause, audioFile: "/sounds/dj-stop.mp3" },
  { id: "31", name: "Duck Toy", icon: Sandwich, audioFile: "/sounds/duck-toy.mp3" },
  { id: "32", name: "Error XP", icon: AlertTriangle, audioFile: "/sounds/error-xp.mp3" },
  { id: "33", name: "Goofy Run", icon: PlaySquare, audioFile: "/sounds/goofy-run.mp3" },
  { id: "34", name: "Lion King", icon: Crown, audioFile: "/sounds/lion-king.mp3" },
  { id: "35", name: "Meme End", icon: Film, audioFile: "/sounds/meme-end.mp3" },
  { id: "36", name: "Threat Detected", icon: ShieldAlert, audioFile: "/sounds/threat-detected.mp3" },
  { id: "37", name: "Takeoff", icon: Rocket, audioFile: "/sounds/takeoff.mp3" },
  { id: "38", name: "Violin Screech", icon: Music4, audioFile: "/sounds/violin-screech.mp3" },
  { id: "39", name: "Error XP Remix", icon: AlertTriangle, audioFile: "/sounds/error-xp-remix.mp3" },
  { id: "40", name: "Gurice", icon: Megaphone, audioFile: "/sounds/uy-gurice.mp3" },
  { id: "41", name: "Inodoro", icon: Bath, audioFile: "/sounds/inodoro.mp3" },
  { id: "42", name: "Ascensor", icon: Bell, audioFile: "/sounds/ascensor.mp3" },
];

const CHANNEL_NAME = "launchpad-sounds";
const STATE_REQUEST_DELAY = 500;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDeviceId(): string {
  if (typeof window === "undefined") return `device-${Date.now()}`;

  let id = localStorage.getItem("launchpad-device-id");
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("launchpad-device-id", id);
  }
  return id;
}

function getInitialOutputMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("launchpad-output-mode") === "true";
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LaunchpadPage() {
  // ========== State Management ==========
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isOutputDevice, setIsOutputDevice] = useState(getInitialOutputMode);
  const [deviceId] = useState(getDeviceId);

  // ========== Refs ==========
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const isOutputDeviceRef = useRef(isOutputDevice);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const playingIdRef = useRef(playingId);

  // Keep refs in sync
  useEffect(() => {
    isOutputDeviceRef.current = isOutputDevice;
  }, [isOutputDevice]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    playingIdRef.current = playingId;
  }, [playingId]);

  // ========== Audio Playback Logic ==========
  const playSoundLocally = useCallback((soundId: string, audioFile: string, targetVolume: number) => {
    console.log("🎵 Playing sound locally:", { soundId, audioFile, targetVolume, isMuted: isMutedRef.current });

    if (isMutedRef.current) {
      console.log("⏸️  Sound playback blocked: muted");
      return;
    }

    // Stop all other sounds
    Object.entries(audioRefs.current).forEach(([key, audio]) => {
      if (key !== soundId && audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // Get or create audio element
    if (!audioRefs.current[soundId]) {
      audioRefs.current[soundId] = new Audio(audioFile);
    }

    const audio = audioRefs.current[soundId];
    if (!audio) {
      console.error("Failed to create audio element");
      return;
    }

    // If already playing this sound, stop it
    if (playingIdRef.current === soundId) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingId(null);
      return;
    }

    // Configure and play
    audio.volume = targetVolume / 100;
    audio.currentTime = 0;
    setPlayingId(soundId);

    audio
      .play()
      .then(() => {
        console.log("✅ Sound playing:", soundId);
      })
      .catch((error) => {
        console.error("❌ Error playing audio:", error);
        setPlayingId(null);
      });

    // Handle sound end
    audio.onended = () => {
      console.log("🏁 Sound ended:", soundId);
      setPlayingId(null);
    };
  }, []);

  // ========== Broadcast State Changes ==========
  const broadcastStateChange = useCallback((broadcast: any, newPlayingId: string | null) => {
    broadcast("sound_state", {
      playingId: newPlayingId,
      timestamp: Date.now(),
    } as SoundStatePayload).catch((err: Error) => {
      console.error("Failed to broadcast state:", err);
    });
  }, []);

  // ========== Real-time Communication Setup ==========
  // Always active - broadcasts and listens automatically
  const { broadcast } = useRealtimeBroadcast({
    channelName: CHANNEL_NAME,
    eventHandlers: [
      {
        event: "play_sound",
        onReceive: (payload: SoundPlayPayload) => {
          if (isOutputDeviceRef.current) {
            console.log("📢 Received remote sound trigger:", payload);
            playSoundLocally(payload.soundId, payload.audioFile, payload.volume);
          }
        },
      },
      {
        event: "sound_state",
        onReceive: (payload: SoundStatePayload) => {
          if (!isOutputDeviceRef.current) {
            console.log("📊 Received sound state update:", payload);
            setPlayingId(payload.playingId);
          }
        },
      },
      {
        event: "state_request",
        onReceive: (payload: StateRequestPayload) => {
          if (isOutputDeviceRef.current && payload.requesterId !== deviceId) {
            console.log("📝 Received state request from:", payload.requesterId);
            broadcast("state_response", {
              playingId: playingIdRef.current,
              volume: volumeRef.current,
              timestamp: Date.now(),
            } as StateResponsePayload).catch(console.error);
          }
        },
      },
      {
        event: "state_response",
        onReceive: (payload: StateResponsePayload) => {
          if (!isOutputDeviceRef.current) {
            console.log("📬 Received state response:", payload);
            setPlayingId(payload.playingId);
          }
        },
      },
    ],
    receiveSelf: false,
    debug: true,
  });

  // ========== Broadcast playing state changes ==========
  useEffect(() => {
    if (isOutputDevice) {
      broadcastStateChange(broadcast, playingId);
    }
  }, [playingId, isOutputDevice, broadcast, broadcastStateChange]);

  // ========== Initial state request for controllers ==========
  useEffect(() => {
    if (!isOutputDevice) {
      console.log("🔄 Requesting current state from output devices...");
      const timer = setTimeout(() => {
        broadcast("state_request", {
          requesterId: deviceId,
          timestamp: Date.now(),
        } as StateRequestPayload).catch(console.error);
      }, STATE_REQUEST_DELAY);

      return () => clearTimeout(timer);
    }
  }, [isOutputDevice, broadcast, deviceId]);

  // ========== Mode Persistence ==========
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("launchpad-output-mode", String(isOutputDevice));
    }
  }, [isOutputDevice]);

  // ========== Event Handlers ==========
  const playSound = useCallback(
    async (button: SoundButton) => {
      if (isOutputDevice) {
        // Output mode: play locally
        playSoundLocally(button.id, button.audioFile, volume);
      } else {
        // Controller mode: broadcast to output devices
        console.log("📡 Broadcasting sound trigger:", button.name);

        try {
          await broadcast("play_sound", {
            soundId: button.id,
            audioFile: button.audioFile,
            volume: volume,
            timestamp: Date.now(),
          } as SoundPlayPayload);

          toast.success({
            title: `📡 ${button.name}`,
            description: "Enviado a dispositivos de salida",
            duration: 1500,
          });
        } catch (error) {
          console.error("Failed to broadcast sound:", error);
          toast.error("Error al enviar comando");
        }
      }
    },
    [isOutputDevice, volume, broadcast, playSoundLocally]
  );

  const toggleMute = useCallback(() => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    if (newMutedState) {
      // Stop all sounds when muting
      Object.values(audioRefs.current).forEach((audio) => {
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
      setPlayingId(null);
    }
  }, [isMuted]);

  const toggleOutputDevice = useCallback(() => {
    const newMode = !isOutputDevice;
    setIsOutputDevice(newMode);

    toast.info({
      title: newMode ? "🔊 Modo Salida de Audio" : "📱 Modo Controlador",
      description: newMode ? "Este dispositivo reproducirá sonidos" : "Envía comandos a dispositivos de salida",
      duration: 2000,
    });
  }, [isOutputDevice]);

  // ========== Render ==========
  return (
    <div className="h-full w-full overflow-auto bg-zinc-950 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-6">
          {/* Title and Mode Status */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">Launchpad</h1>
              <p className="text-xs leading-relaxed text-zinc-400 sm:text-sm">
                {isOutputDevice ? "Salida de Audio - Reproduce sonidos" : "Controlador - Envía comandos"}
              </p>
            </div>

            {/* Mode Toggle */}
            <Button
              variant={isOutputDevice ? "default" : "outline"}
              size="lg"
              onClick={toggleOutputDevice}
              className={`w-full transition-all sm:w-auto ${
                isOutputDevice
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-black"
              }`}
              title={isOutputDevice ? "Este dispositivo reproduce sonidos" : "Este dispositivo envía comandos"}
            >
              <Speaker className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-sm sm:text-base">{isOutputDevice ? "Salida de Audio" : "Controlador"}</span>
            </Button>
          </div>

          {/* Audio Controls - Output Mode Only */}
          {isOutputDevice && (
            <div className="flex flex-col items-stretch gap-3 border-t border-zinc-800 pt-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex flex-1 items-center gap-3">
                <Volume2 className="h-4 w-4 flex-shrink-0 text-zinc-400 sm:h-5 sm:w-5" />
                <Slider
                  value={[volume]}
                  onValueChange={(value) => setVolume(value[0])}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="min-w-[3ch] text-sm text-zinc-400">{volume}%</span>
              </div>
              <Button
                variant={isMuted ? "destructive" : "outline"}
                size="lg"
                onClick={toggleMute}
                className={`w-full transition-all sm:w-auto ${!isMuted ? "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black" : ""}`}
              >
                {isMuted ? (
                  <>
                    <VolumeX className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base">Silenciado</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base">Activo</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Sound Grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {SOUND_BUTTONS.map((button) => {
            const Icon = button.icon;
            const isPlaying = playingId === button.id;

            return (
              <Card
                key={button.id}
                className={`group relative cursor-pointer touch-manipulation border transition-all duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:scale-95 ${
                  isPlaying
                    ? "border-yellow-500 bg-zinc-800 shadow-lg shadow-yellow-500/20"
                    : isOutputDevice
                      ? "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                      : "border-blue-800 bg-zinc-900 hover:border-blue-600 hover:bg-zinc-800"
                } ${isMuted && isOutputDevice ? "cursor-not-allowed opacity-50" : ""} ${
                  isOutputDevice ? "focus-visible:ring-yellow-500" : "focus-visible:ring-blue-500"
                }`}
                onClick={() => playSound(button)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    playSound(button);
                  }
                }}
                tabIndex={isMuted && isOutputDevice ? -1 : 0}
                role="button"
                aria-label={isOutputDevice ? `Play ${button.name}` : `Trigger ${button.name} remotely`}
                aria-pressed={isPlaying}
                aria-disabled={isMuted && isOutputDevice}
              >
                <CardContent className="flex flex-col items-center justify-center p-4 sm:p-6">
                  <div className="mb-2 transition-transform group-hover:scale-110 sm:mb-3">
                    <Icon
                      className={`h-8 w-8 transition-colors sm:h-10 sm:w-10 md:h-12 md:w-12 ${
                        isPlaying ? "text-yellow-400" : "text-zinc-400 group-hover:text-white"
                      }`}
                    />
                  </div>
                  <div
                    className={`line-clamp-2 text-center text-xs font-medium transition-colors sm:text-sm ${
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
                      {!isOutputDevice && (
                        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg border-2 border-yellow-500" />
                      )}
                    </>
                  )}

                  {/* Controller Mode Indicator */}
                  {!isOutputDevice && !isPlaying && (
                    <div className="absolute right-1.5 top-1.5 rounded-full bg-blue-500/20 p-0.5 sm:right-2 sm:top-2 sm:p-1">
                      <Radio className="h-2.5 w-2.5 text-blue-400 sm:h-3 sm:w-3" />
                    </div>
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
