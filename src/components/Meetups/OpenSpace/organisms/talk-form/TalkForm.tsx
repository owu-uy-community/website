"use client";

import { AlertTriangle, Loader2, RotateCcw, Settings, Sparkles } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Textarea } from "components/shared/ui/textarea";
import type { StickyNote } from "lib/orpc";

import { AISuggestion } from "./AISuggestion";
import { ResourceRequirements } from "./ResourceRequirements";
import { ScheduleFields } from "./ScheduleFields";
import type { RoomWithResources } from "./types";
import type { TalkFormController } from "./use-talk-form";

/** The submit button lives in the modal footer, associated via this id. */
export const TALK_FORM_ID = "talk-form";

interface TalkFormProps {
  controller: TalkFormController;
  note: StickyNote | null;
  rooms: string[];
  roomsData: RoomWithResources[];
  timeSlots: string[];
}

export function TalkForm({ controller, note, rooms, roomsData, timeSlots }: TalkFormProps) {
  const {
    control,
    register,
    formErrors,
    watchedValues,
    submitForm,
    validationError,
    aiSuggesting,
    aiReasoning,
    showAiReasoning,
    toggleAiReasoning,
    showAdvanced,
    toggleAdvanced,
    additionalContext,
    setAdditionalContext,
    suggestionHistory,
    currentHistoryIndex,
    originalSchedule,
    handleAiSuggest,
    navigateHistory,
    applyAlternative,
    handleResetToOriginal,
  } = controller;

  return (
    <form className="space-y-4" id={TALK_FORM_ID} onSubmit={submitForm}>
      <div className="space-y-2">
        <Label htmlFor="title">Título</Label>
        <Input autoFocus id="title" {...register("title")} placeholder="¿De qué va la charla?" />
        {formErrors.title && <p className="text-sm text-destructive">{formErrors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="speaker">Orador (opcional)</Label>
        <Input id="speaker" {...register("speaker")} placeholder="Nombre de quien la da" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Lugar y horario</Label>
          <div className="flex gap-2">
            {originalSchedule && (
              <Button
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                size="icon"
                title="Restaurar horario original"
                type="button"
                variant="outline"
                onClick={handleResetToOriginal}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button
              className={cn("h-8 w-8", showAdvanced ? "bg-accent text-foreground" : "text-muted-foreground")}
              size="icon"
              title="Opciones avanzadas"
              type="button"
              variant="outline"
              onClick={toggleAdvanced}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              className="gap-2"
              disabled={aiSuggesting || !watchedValues.title?.trim()}
              size="sm"
              type="button"
              variant="outline"
              onClick={handleAiSuggest}
            >
              {aiSuggesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              {aiSuggesting ? "Sugiriendo…" : "Sugerir con AI"}
            </Button>
          </div>
        </div>

        {showAdvanced && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <Label className="text-sm" htmlFor="additionalContext">
              Contexto adicional para la AI (opcional)
            </Label>
            <Textarea
              className="resize-none text-sm"
              id="additionalContext"
              placeholder="Ej: 'prefiero horarios de la tarde', 'el orador está libre recién a las 15:00'…"
              rows={3}
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ayuda a la AI a elegir el mejor horario y lugar para la charla.
            </p>
          </div>
        )}

        <ScheduleFields control={control} note={note} rooms={rooms} timeSlots={timeSlots} />

        <ResourceRequirements control={control} roomsData={roomsData} watchedValues={watchedValues} />

        <AISuggestion
          aiReasoning={aiReasoning}
          currentHistoryIndex={currentHistoryIndex}
          showAiReasoning={showAiReasoning}
          suggestionHistory={suggestionHistory}
          onApplyAlternative={applyAlternative}
          onNavigateHistory={navigateHistory}
          onToggleReasoning={toggleAiReasoning}
        />
      </div>

      {validationError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-foreground">{validationError}</p>
        </div>
      )}
    </form>
  );
}
