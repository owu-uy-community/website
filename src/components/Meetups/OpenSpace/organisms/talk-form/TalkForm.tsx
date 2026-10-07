"use client";

import { AlertTriangle, Loader2, RotateCcw, Settings, Sparkles } from "lucide-react";

import { cn } from "app/lib/utils";
import { Collapse, FieldError, Notice, PanelSection } from "components/Admin/panel";
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
  return (
    <Collapse show={show}>
      <p className="flex items-center gap-1.5 pt-1.5 text-xs text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5" />
        La AI no leyó esto con claridad — revisalo contra la tarjeta.
      </p>
    </Collapse>
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
    <form className="space-y-7" id={TALK_FORM_ID} noValidate onSubmit={submitForm}>
      <PanelSection title="Charla">
        <div className="space-y-2">
          <Label htmlFor="title">Título</Label>
          <Input
            aria-invalid={Boolean(formErrors.title)}
            data-autofocus
            id="title"
            {...register("title")}
            className={cn("h-11 text-base", needsReview("title") && reviewRing)}
            placeholder="¿De qué va la charla?"
          />
          <ReviewHint show={needsReview("title")} />
          <FieldError message={formErrors.title?.message} />
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
      </PanelSection>

      <PanelSection
        action={
          <div className="flex gap-1.5">
            {originalSchedule && (
              <Button
                aria-label="Restaurar horario original"
                className="h-11 w-11 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
                size="icon"
                title="Restaurar horario original"
                type="button"
                variant="ghost"
                onClick={handleResetToOriginal}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button
              aria-expanded={showAdvanced}
              aria-label="Opciones avanzadas"
              className={cn(
                "h-11 w-11 sm:h-8 sm:w-8",
                showAdvanced ? "bg-accent text-foreground" : "text-muted-foreground"
              )}
              size="icon"
              title="Opciones avanzadas"
              type="button"
              variant="ghost"
              onClick={toggleAdvanced}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              className="h-11 gap-2 rounded-full sm:h-8"
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
        }
        title="Lugar y horario"
      >
        <Collapse show={showAdvanced}>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
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
            <p className="text-xs text-muted-foreground">Ayuda a la AI a elegir el mejor horario y lugar.</p>
          </div>
        </Collapse>

        <ScheduleFields control={control} note={note} rooms={rooms} timeSlots={timeSlots} />

        <Collapse show={Boolean(aiReasoning)}>
          <AISuggestion
            aiReasoning={aiReasoning}
            currentHistoryIndex={currentHistoryIndex}
            showAiReasoning={showAiReasoning}
            suggestionHistory={suggestionHistory}
            onApplyAlternative={applyAlternative}
            onNavigateHistory={navigateHistory}
            onToggleReasoning={toggleAiReasoning}
          />
        </Collapse>
      </PanelSection>

      <PanelSection title="Recursos">
        <ResourceRequirements control={control} roomsData={roomsData} watchedValues={watchedValues} />
        <ReviewHint show={needsReview("requisito")} />
      </PanelSection>

      <Notice show={Boolean(validationError)} tone="danger">
        {validationError}
      </Notice>
    </form>
  );
}
