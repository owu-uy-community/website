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
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeBroadcast } from "hooks/useRealtimeBroadcast";
import { SOUNDS } from "lib/launchpad/sounds";
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

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "1": Layers,
  "2": Bird,
  "3": Sparkles,
  "4": Sparkles,
  "5": PartyPopper,
  "6": MousePointer,
  "7": Drum,
  "8": HandMetal,
  "9": Laugh,
  "10": ThumbsDown,
  "11": Bell,
  "12": Music,
  "13": Disc,
  "14": CircleDot,
  "15": Bot,
  "16": ToggleLeft,
  "17": MoveUp,
  "18": Zap,
  "19": Music,
  "20": Radio,
  "21": MonitorPlay,
  "22": Smile,
  "23": Sparkles,
  "24": ThumbsUp,
  "25": Squirrel,
  "26": Clapperboard,
  "27": MessageSquare,
  "28": BusFront,
  "29": Code2,
  "30": Pause,
  "31": Sandwich,
  "32": AlertTriangle,
  "33": PlaySquare,
  "34": Crown,
  "35": Film,
  "36": ShieldAlert,
  "37": Rocket,
  "38": Music4,
  "39": AlertTriangle,
  "40": Megaphone,
  "41": Bath,
  "42": Bell,
};

// The bank itself lives in lib/launchpad/sounds so OBS cues can fire it too.
const SOUND_BUTTONS: SoundButton[] = SOUNDS.map((sound) => ({ ...sound, icon: ICONS[sound.id] ?? Music }));

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

export default function LaunchpadClient() {
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
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Launchpad</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOutputDevice
              ? "Salida de audio — este dispositivo reproduce los sonidos"
              : "Controlador — envía comandos a los dispositivos de salida"}
          </p>
        </div>

        <ToggleGroup
          type="single"
          value={isOutputDevice ? "output" : "controller"}
          variant="outline"
          onValueChange={(value) => {
            if (value && (value === "output") !== isOutputDevice) toggleOutputDevice();
          }}
        >
          <ToggleGroupItem aria-label="Modo controlador" value="controller">
            <Radio />
            Controlador
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="Modo salida de audio" value="output">
            <Speaker />
            Salida de audio
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Audio Controls - Output Mode Only */}
      {isOutputDevice && (
        <div className="flex flex-col items-stretch gap-3 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 items-center gap-3">
            <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Slider
              className="flex-1"
              max={100}
              step={1}
              value={[volume]}
              onValueChange={(value) => setVolume(value[0])}
            />
            <span className="min-w-[3ch] font-terminal text-sm text-muted-foreground tabular-nums">{volume}%</span>
          </div>
          <Button size="sm" variant={isMuted ? "destructive" : "outline"} onClick={toggleMute}>
            {isMuted ? <VolumeX /> : <Volume2 />}
            {isMuted ? "Silenciado" : "Activo"}
          </Button>
        </div>
      )}

      {/* Sound Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {SOUND_BUTTONS.map((button) => {
          const Icon = button.icon;
          const isPlaying = playingId === button.id;

          return (
            <Card
              key={button.id}
              className={`group relative cursor-pointer touch-manipulation border transition-all duration-200 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden active:scale-95 ${
                isPlaying
                  ? "border-primary bg-accent shadow-lg shadow-primary/20"
                  : "border-border hover:border-muted-foreground/40"
              } ${isMuted && isOutputDevice ? "cursor-not-allowed opacity-50" : ""}`}
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
                      isPlaying ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                </div>
                <div
                  className={`line-clamp-2 text-center text-xs font-medium transition-colors sm:text-sm ${
                    isPlaying ? "text-primary" : "text-foreground"
                  }`}
                >
                  {button.name}
                </div>

                {/* Playing Indicator */}
                {isPlaying && (
                  <>
                    <div className="absolute top-2 right-2 h-2 w-2 animate-ping rounded-full bg-primary" />
                    <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                    {!isOutputDevice && (
                      <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg border-2 border-primary" />
                    )}
                  </>
                )}

                {/* Controller Mode Indicator */}
                {!isOutputDevice && !isPlaying && (
                  <div className="absolute top-1.5 right-1.5 rounded-full bg-muted p-0.5 sm:top-2 sm:right-2 sm:p-1">
                    <Radio className="h-2.5 w-2.5 text-muted-foreground sm:h-3 sm:w-3" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
