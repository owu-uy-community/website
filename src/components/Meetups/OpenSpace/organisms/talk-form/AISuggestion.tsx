"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Info, Sparkles } from "lucide-react";

import { cn } from "app/lib/utils";
import { Collapse, Notice } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";

import type { SuggestionAlternative, SuggestionEntry } from "./types";

interface AISuggestionProps {
  aiReasoning: string | null;
  showAiReasoning: boolean;
  suggestionHistory: SuggestionEntry[];
  currentHistoryIndex: number;
  onToggleReasoning: () => void;
  onApplyAlternative: (alternative: SuggestionAlternative) => void;
  onNavigateHistory: (direction: "prev" | "next") => void;
}

export function AISuggestion({
  aiReasoning,
  showAiReasoning,
  suggestionHistory,
  currentHistoryIndex,
  onToggleReasoning,
  onApplyAlternative,
  onNavigateHistory,
}: AISuggestionProps) {
  if (!aiReasoning) return null;

  const current = suggestionHistory[currentHistoryIndex];

  return (
    <div className="space-y-2">
      <Notice show={Boolean(current?.degraded)} tone="warning">
        La IA no pudo sugerir nada: este es apenas el primer lugar libre. Elegí sala y bloque a mano.
      </Notice>

      <Button
        aria-expanded={showAiReasoning}
        className="w-full justify-between rounded-lg border border-border bg-raised text-foreground hover:bg-accent"
        size="sm"
        type="button"
        variant="ghost"
        onClick={onToggleReasoning}
      >
        <span className="flex items-center gap-2">
          <Info className="text-muted-foreground" />
          <span className="text-ui font-medium">Razonamiento de la IA</span>
        </span>
        <ChevronDown
          className={cn("text-muted-foreground transition-transform duration-200", showAiReasoning && "rotate-180")}
        />
      </Button>

      <Collapse className="space-y-3" show={showAiReasoning}>
        <div className="rounded-lg border border-border bg-raised p-3">
          <div className="flex items-start gap-2.5">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-ui font-medium text-foreground">¿Por qué acá?</p>
              <p className="text-ui leading-relaxed text-muted-foreground">{aiReasoning}</p>
            </div>
          </div>
        </div>

        {current?.alternatives && current.alternatives.length > 0 && (
          <div className="space-y-2">
            <p className="text-meta font-medium text-muted-foreground">Otras opciones</p>
            {current.alternatives.map((alt, idx) => (
              <button
                key={idx}
                className="w-full rounded-md border border-border bg-raised p-2 text-left transition-colors hover:border-white/15 hover:bg-accent"
                type="button"
                onClick={() => onApplyAlternative(alt)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-terminal text-meta font-medium text-foreground tabular-nums">
                      {alt.room} · {alt.timeSlot}
                    </p>
                    <p className="mt-0.5 text-meta text-muted-foreground">{alt.reasoning}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </Collapse>

      {suggestionHistory.length > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-2">
          <Button
            className="gap-1 text-muted-foreground hover:text-foreground"
            disabled={currentHistoryIndex <= 0}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onNavigateHistory("prev")}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="font-terminal text-meta text-muted-foreground tabular-nums">
            {currentHistoryIndex + 1} / {suggestionHistory.length}
          </span>
          <Button
            className="gap-1 text-muted-foreground hover:text-foreground"
            disabled={currentHistoryIndex >= suggestionHistory.length - 1}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onNavigateHistory("next")}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
