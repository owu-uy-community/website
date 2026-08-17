"use client";

import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Plus, Save, Trash2, X, Edit } from "lucide-react";
import { cn } from "app/lib/utils";
import { motion, AnimatePresence } from "motion/react";

import type { PresetQueue, QueueItem } from "./types";

interface PresetsBarProps {
  presets: PresetQueue[];
  currentPreset: string;
  showPresetForm: boolean;
  newPresetName: string;
  queueItems: QueueItem[];
  loadPreset: (presetId: string) => void;
  setShowPresetForm: (show: boolean) => void;
  setNewPresetName: (name: string) => void;
  savePreset: () => void;
  startEditingPreset: (presetId: string) => void;
  deletePreset: (presetId: string) => void;
}

export function PresetsBar({
  presets,
  currentPreset,
  showPresetForm,
  newPresetName,
  queueItems,
  loadPreset,
  setShowPresetForm,
  setNewPresetName,
  savePreset,
  startEditingPreset,
  deletePreset,
}: PresetsBarProps) {
  return (
    <motion.div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 backdrop-blur-sm md:flex-row md:items-center">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        <span className="whitespace-nowrap text-sm font-medium text-white/70">Presets</span>
        {presets.map((preset) => (
          <Button
            key={preset.id}
            onClick={() => loadPreset(preset.id)}
            className={cn(
              "h-8 flex-shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium",
              currentPreset === preset.id
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/20 hover:!text-white"
            )}
          >
            {preset.name}
            <Badge className="ml-2 bg-black/20 px-1.5 py-0.5 text-xs">{preset.items.length}</Badge>
          </Button>
        ))}
      </div>

      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        <AnimatePresence mode="wait">
          {showPresetForm ? (
            <motion.div key="form" className="flex items-center gap-2">
              <Input
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Enter preset name..."
                className="h-8 w-full rounded-lg border-0 bg-white text-sm text-black lg:w-36"
                onKeyDown={(e) => e.key === "Enter" && savePreset()}
                autoFocus
              />
              <Button
                onClick={savePreset}
                disabled={!newPresetName.trim() || queueItems.length === 0}
                className="h-8 rounded-lg bg-white px-3 py-2 text-xs text-black hover:bg-white/90"
              >
                <Save className="h-3 w-3" />
              </Button>
              <Button
                onClick={() => {
                  setShowPresetForm(false);
                  setNewPresetName("");
                }}
                className="h-8 rounded-lg bg-white/20 px-3 py-2 text-xs text-white hover:bg-white/30 hover:text-white"
              >
                <X className="h-3 w-3" />
              </Button>
            </motion.div>
          ) : (
            <motion.div key="buttons" className="flex items-center gap-2">
              <Button
                onClick={() => setShowPresetForm(true)}
                disabled={queueItems.length === 0}
                className="h-8 rounded-lg bg-white px-3 py-2 text-xs text-black hover:bg-white/90"
                title="Create new preset"
              >
                <Plus className="h-3 w-3" />
              </Button>
              {currentPreset && (
                <>
                  <Button
                    onClick={() => startEditingPreset(currentPreset)}
                    className="h-8 rounded-lg bg-white/20 px-3 py-2 text-xs text-white hover:bg-white/30 hover:text-white"
                    title="Edit preset"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    onClick={() => deletePreset(currentPreset)}
                    className="h-8 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-400 hover:bg-red-500/30"
                    title="Delete preset"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
