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
import type { ReviewableField, RoomWithResources } from "./types";
import type { TalkFormController } from "./use-talk-form";

/** The submit button lives in the modal footer, associated via this id. */
export const TALK_FORM_ID = "talk-form";

/** Shown under a field the OCR was unsure about, so the staffer checks that one and not all. */
function ReviewHint({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <p className="flex items-center gap-1.5 text-xs text-amber-500">
      <AlertTriangle className="h-3.5 w-3.5" />
      La AI no leyó esto con claridad — revisalo contra la tarjeta.
    </p>
  );
}

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
    fieldsToReview,
  } = controller;

  const needsReview = (field: ReviewableField) => fieldsToReview.includes(field);
  const reviewRing = "border-amber-500/70 focus-visible:ring-amber-500/50";

  return (
    <form className="space-y-4" id={TALK_FORM_ID} onSubmit={submitForm}>
      <div className="space-y-2">
        <Label htmlFor="title">Título</Label>
        <Input
          autoFocus
          id="title"
          {...register("title")}
          className={cn(needsReview("title") && reviewRing)}
          placeholder="¿De qué va la charla?"
        />
        <ReviewHint show={needsReview("title")} />
        {formErrors.title && <p className="text-destructive text-sm">{formErrors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="speaker">Orador (opcional)</Label>
        <Input
          id="speaker"
          {...register("speaker")}
          className={cn(needsReview("speaker") && reviewRing)}
          placeholder="Nombre de quien la da"
        />
        <ReviewHint show={needsReview("speaker")} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Lugar y horario</Label>
          <div className="flex flex-wrap gap-2">
            {originalSchedule && (
              <Button
                className="text-muted-foreground hover:text-foreground h-11 w-11 sm:h-8 sm:w-8"
                aria-label="Restaurar horario original"
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
              className={cn(
                "h-11 w-11 sm:h-8 sm:w-8",
                showAdvanced ? "bg-accent text-foreground" : "text-muted-foreground"
              )}
              aria-label="Opciones avanzadas"
              size="icon"
              title="Opciones avanzadas"
              type="button"
              variant="outline"
              onClick={toggleAdvanced}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              className="h-11 gap-2 sm:h-9"
              disabled={aiSuggesting || !watchedValues.title?.trim()}
              size="sm"
              type="button"
              variant="outline"
              onClick={handleAiSuggest}
            >
              {aiSuggesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="text-primary h-3.5 w-3.5" />
              )}
              {aiSuggesting ? "Sugiriendo…" : "Sugerir con AI"}
            </Button>
          </div>
        </div>

        {showAdvanced && (
          <div className="border-border bg-muted/30 space-y-2 rounded-md border p-3">
            <Label className="text-sm" htmlFor="additionalContext">
              Contexto adicional para la AI (opcional)
            </Label>
            <Textarea
              className="resize-none"
              id="additionalContext"
              placeholder="Ej: 'prefiero horarios de la tarde', 'el orador está libre recién a las 15:00'…"
              rows={3}
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Ayuda a la AI a elegir el mejor horario y lugar para la charla.
            </p>
          </div>
        )}

        <ScheduleFields control={control} note={note} rooms={rooms} timeSlots={timeSlots} />

        <ResourceRequirements control={control} roomsData={roomsData} watchedValues={watchedValues} />

        <ReviewHint show={needsReview("requisito")} />

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
        <div className="border-destructive/40 bg-destructive/10 flex items-start gap-2 rounded-md border px-3 py-2">
          <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-foreground text-sm">{validationError}</p>
        </div>
      )}
    </form>
  );
}
