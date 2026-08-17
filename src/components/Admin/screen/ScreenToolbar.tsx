"use client";

import { Button } from "components/shared/ui/button";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Settings,
  Monitor,
  Wifi,
  WifiOff,
  RefreshCw,
  List,
  MousePointer,
  Image,
  XCircle,
  Maximize,
  Minimize,
} from "lucide-react";
import { cn } from "app/lib/utils";
import { motion } from "motion/react";

import type { QueueItem, ScenePreviews } from "./types";

interface ScreenToolbarProps {
  isConnected: boolean;
  isConnecting: boolean;
  isPlaying: boolean;
  directMode: boolean;
  playerMode: boolean;
  showConnectionSettings: boolean;
  isLoadingPreviews: boolean;
  queueItems: QueueItem[];
  scenePreviews: ScenePreviews;
  togglePlayback: () => void;
  stopLoop: () => void;
  clearQueue: () => void;
  setDirectModeDB: (mode: boolean) => void;
  refreshScenes: () => void;
  handleLoadPreviews: () => void;
  handleClearPreviews: () => void;
  setPlayerMode: (mode: boolean) => void;
  setShowConnectionSettings: (show: boolean) => void;
}

export function ScreenToolbar({
  isConnected,
  isConnecting,
  isPlaying,
  directMode,
  playerMode,
  showConnectionSettings,
  isLoadingPreviews,
  queueItems,
  scenePreviews,
  togglePlayback,
  stopLoop,
  clearQueue,
  setDirectModeDB,
  refreshScenes,
  handleLoadPreviews,
  handleClearPreviews,
  setPlayerMode,
  setShowConnectionSettings,
}: ScreenToolbarProps) {
  return (
    <motion.div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Monitor className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="font-display text-xl font-bold text-foreground">Pantalla OBS</h1>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2">
        {/* Connection Status */}
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium",
            isConnected ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"
          )}
        >
          {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {isConnecting ? "Conectando…" : isConnected ? "Conectado" : "Desconectado"}
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <Button
            onClick={togglePlayback}
            disabled={queueItems.length === 0 || !isConnected}
            className="h-8 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <Button
            onClick={stopLoop}
            className="h-8 rounded-md bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <Square className="h-3 w-3" />
          </Button>
          <Button
            onClick={clearQueue}
            className="h-8 rounded-md bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>

        {/* Mode Toggle */}
        <Button
          onClick={() => setDirectModeDB(!directMode)}
          disabled={!isConnected}
          className={cn(
            "h-8 rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200",
            directMode
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          {directMode ? <MousePointer className="mr-2 h-3 w-3" /> : <List className="mr-2 h-3 w-3" />}
          {directMode ? "DIRECTO" : "COLA"}
        </Button>

        {/* Refresh & Settings */}
        <Button
          onClick={refreshScenes}
          disabled={!isConnected}
          className="h-8 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          title="Actualizar escenas"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleLoadPreviews}
          disabled={!isConnected || isLoadingPreviews}
          className="h-8 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          title="Cargar vistas previas"
        >
          {isLoadingPreviews ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
        </Button>
        <Button
          onClick={handleClearPreviews}
          disabled={Object.keys(scenePreviews).length === 0}
          className="h-8 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          title="Limpiar vistas previas"
        >
          <XCircle className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => setPlayerMode(!playerMode)}
          disabled={!isConnected}
          className={cn(
            "h-8 rounded-lg px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80",
            playerMode ? "bg-accent" : "bg-secondary"
          )}
          title={playerMode ? "Salir del modo player" : "Modo player (pantalla completa)"}
        >
          {playerMode ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
        <Button
          onClick={() => setShowConnectionSettings(!showConnectionSettings)}
          className="h-8 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          title="Configuración de conexión"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
