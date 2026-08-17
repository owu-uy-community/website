"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Info, Repeat2, Sparkles } from "lucide-react";

import { cn } from "app/lib/utils";
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
      <Button
        className="w-full justify-between border border-border bg-muted/30 text-foreground hover:bg-muted/60"
        size="sm"
        type="button"
        variant="ghost"
        onClick={onToggleReasoning}
      >
        <span className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Razonamiento de la AI</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", showAiReasoning && "rotate-180")}
        />
      </Button>

      {showAiReasoning && (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">¿Por qué este horario?</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{aiReasoning}</p>
              </div>
            </div>
          </div>

          {current?.swapSuggestion?.shouldSwap && (
            <div className="rounded-md border border-primary/30 bg-primary/[0.06] p-3">
              <div className="flex items-start gap-2">
                <Repeat2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">Sugerencia de intercambio</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Considerá intercambiar con &quot;{current.swapSuggestion?.talkToSwap}&quot;.{" "}
                    {current.swapSuggestion?.swapReasoning}
                  </p>
                </div>
              </div>
            </div>
          )}

          {current?.alternatives && current.alternatives.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Alternativas sugeridas</p>
              {current.alternatives.map((alt, idx) => (
                <button
                  key={idx}
                  className="w-full rounded-md border border-border bg-muted/20 p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                  type="button"
                  onClick={() => onApplyAlternative(alt)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-terminal text-xs font-medium text-foreground">
                        {alt.room} · {alt.timeSlot}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{alt.reasoning}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
          <span className="font-terminal text-xs tabular-nums text-muted-foreground">
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
