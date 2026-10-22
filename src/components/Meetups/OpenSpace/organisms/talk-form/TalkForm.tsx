"use client";

import { AlertTriangle, Loader2, RotateCcw, Settings2, Sparkles } from "lucide-react";

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

/** The submit button lives in the panel's footer, associated via this id. */
export const TALK_FORM_ID = "talk-form";

const FIELD_LABEL = "text-meta text-muted-foreground";

/** Shown under a field the OCR was unsure about, so the staffer checks that one and not all. */
function ReviewHint({ show }: { show: boolean }) {
  return (
    <Collapse show={show}>
      <p className="flex items-center gap-1.5 pt-1.5 text-meta text-warning-foreground">
        <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
        La IA no leyó esto con claridad: revisalo contra la tarjeta.
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

/** The talk's fields, shared by the editor sheet and the board's inspector (it sizes itself to its box). */
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
    suggestIfAsked,
    navigateHistory,
    applyAlternative,
    handleResetToOriginal,
    fieldsToReview,
  } = controller;

  const needsReview = (field: ReviewableField) => fieldsToReview.includes(field);
  const reviewRing = "border-warning/60 focus-visible:border-warning/70 focus-visible:ring-warning/25";

  return (
    <form className="@container space-y-6" id={TALK_FORM_ID} noValidate onSubmit={submitForm}>
      <PanelSection title="Charla">
        <div className="space-y-1.5">
          <Label className={FIELD_LABEL} htmlFor="title">
            Título
          </Label>
          <Input
            aria-invalid={Boolean(formErrors.title)}
            data-autofocus
            id="title"
            {...register("title", { onBlur: suggestIfAsked })}
            className={cn(needsReview("title") && reviewRing)}
            placeholder="¿De qué va la charla?"
          />
          <ReviewHint show={needsReview("title")} />
          <FieldError message={formErrors.title?.message} />
        </div>

        <div className="space-y-1.5">
          <Label className={FIELD_LABEL} htmlFor="speaker">
            Orador (opcional)
          </Label>
          <Input
            id="speaker"
            {...register("speaker")}
            className={cn(needsReview("speaker") && reviewRing)}
            placeholder="Nombre de quien la da"
          />
          <ReviewHint show={needsReview("speaker")} />
        </div>

        <div className="space-y-1.5">
          <Label className={FIELD_LABEL} htmlFor="description">
            Descripción (opcional)
          </Label>
          <Textarea
            className="min-h-16 resize-none"
            id="description"
            placeholder="Una línea sobre el tema"
            rows={2}
            {...register("description")}
          />
        </div>
      </PanelSection>

      <PanelSection
        action={
          <div className="flex items-center gap-1">
            {originalSchedule && (
              <Button
                size="sm"
                title="Volver al lugar de antes"
                type="button"
                variant="ghost"
                onClick={handleResetToOriginal}
              >
                <RotateCcw />
                {/* A word for a touchscreen, which never shows the title; a 320px phone keeps the icon. */}
                <span className="max-[359px]:sr-only">Deshacer</span>
              </Button>
            )}
            <Button
              aria-expanded={showAdvanced}
              aria-label="Contexto para la IA"
              className={cn(showAdvanced && "bg-raised text-foreground")}
              size="icon-sm"
              title="Contexto para la IA"
              type="button"
              variant="ghost"
              onClick={toggleAdvanced}
            >
              <Settings2 />
            </Button>
            <Button
              disabled={aiSuggesting || !watchedValues.title?.trim()}
              size="sm"
              type="button"
              variant="outline"
              onClick={handleAiSuggest}
            >
              {aiSuggesting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {aiSuggesting ? "Sugiriendo…" : "Sugerir con IA"}
            </Button>
          </div>
        }
        title="Lugar y bloque"
      >
        <Collapse show={showAdvanced}>
          <div className="space-y-1.5 rounded-lg border border-border bg-raised p-3">
            <Label className={FIELD_LABEL} htmlFor="additionalContext">
              Contexto para la IA (opcional)
            </Label>
            <Textarea
              className="resize-none"
              id="additionalContext"
              placeholder="Ej: «prefiere la tarde», «el orador llega recién a las 17:00»…"
              rows={3}
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
            />
            <p className="text-meta text-muted-foreground">Ayuda a la IA a elegir la sala y el bloque.</p>
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

      <PanelSection title="Necesita">
        <ResourceRequirements control={control} roomsData={roomsData} watchedValues={watchedValues} />
        <ReviewHint show={needsReview("requisito")} />
      </PanelSection>

      <Notice show={Boolean(validationError)} tone="danger">
        {validationError}
      </Notice>
    </form>
  );
}
