import { useState, useRef, useEffect, useCallback } from "react";
import { ORPCError } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { client } from "lib/orpc";
import type { StickyNote } from "lib/orpc";
import { orpc } from "lib/orpc/client";
import { toast } from "components/shared/ui/toast-utils";

import type { FindFreeSpotResponse } from "lib/orpc/ocr/schemas";

import { talkFormSchema } from "./types";
import type {
  ReviewableField,
  RoomWithResources,
  ScheduleSlot,
  SuggestionAlternative,
  SuggestionEntry,
  TalkFormData,
} from "./types";

/**
 * Long edge of the uploaded photo. ~1.5MP is the sweet spot for the vision models behind the OCR:
 * more pixels get billed and then discarded, fewer start costing handwriting accuracy. At quality
 * 0.85 a card lands around 150–400KB instead of several megabytes over venue wifi.
 */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/** What to tell the staffer when saving fails; a taken place names the talk that has it. */
function saveErrorMessage(error: unknown): string {
  if (error instanceof ORPCError && error.code === "CONFLICT") {
    const { occupiedBy } = (error.data ?? {}) as { occupiedBy?: string };
    if (occupiedBy) return `Este espacio ya está ocupado por "${occupiedBy}"`;
  }
  if (error instanceof ORPCError && error.code === "INTERNAL_SERVER_ERROR") {
    return "Error del servidor. Por favor intenta con otro espacio.";
  }

  return error instanceof Error && error.message ? error.message : "Error al guardar la charla";
}

interface UseTalkFormParams {
  open: boolean;
  openSpaceId: string;
  note: StickyNote | null;
  notes: StickyNote[];
  rooms: string[];
  roomsData: RoomWithResources[];
  timeSlots: string[];
  onSave: (noteData: Partial<StickyNote> & { skipResourceValidation?: boolean }) => void;
}

export function useTalkForm({
  open,
  openSpaceId,
  note,
  notes,
  rooms,
  roomsData,
  timeSlots,
  onSave,
}: UseTalkFormParams) {
  const {
    control,
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors: formErrors },
    setValue,
    watch,
    reset,
  } = useForm<TalkFormData>({
    resolver: zodResolver(talkFormSchema),
    defaultValues: {
      title: "",
      speaker: "",
      room: rooms[0] || "",
      timeSlot: timeSlots[0] || "",
      needsTV: false,
      needsWhiteboard: false,
    },
  });

  const watchedValues = watch();

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("form");
  /** Fields the OCR could not read confidently, so the form can ask for a human check. */
  const [fieldsToReview, setFieldsToReview] = useState<ReviewableField[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [validationError, setValidationError] = useState("");
  const [resourceWarning, setResourceWarning] = useState<string[]>([]);
  /**
   * A ref, not state: "continuar de todos modos" re-submits in the same tick,
   * and a state update would not be visible to that submit.
   */
  const confirmedProceedRef = useRef(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [showAiReasoning, setShowAiReasoning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");

  const [suggestionHistory, setSuggestionHistory] = useState<SuggestionEntry[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [originalSchedule, setOriginalSchedule] = useState<ScheduleSlot | null>(null);

  const queryClient = useQueryClient();

  const applySuggestion = (result: FindFreeSpotResponse) => {
    setSuggestionHistory((prev) => [
      ...prev,
      {
        room: result.suggestedRoom,
        timeSlot: result.suggestedTimeSlot,
        reasoning: result.reasoning,
        alternatives: result.alternatives,
        degraded: result.degraded,
      },
    ]);
    setCurrentHistoryIndex((prev) => prev + 1);

    setValue("room", result.suggestedRoom);
    setValue("timeSlot", result.suggestedTimeSlot);

    setAiReasoning(result.reasoning);
    setShowAiReasoning(false);
  };

  /** Ask for a room + time slot ("Sugerir con AI"). The server knows the board, including which blocks already ended. */
  const requestSuggestion = async (talk: Pick<TalkFormData, "title" | "speaker" | "needsTV" | "needsWhiteboard">) => {
    setAiSuggesting(true);
    setAiReasoning(null);
    setValidationError("");

    try {
      applySuggestion(
        await client.ocr.findFreeSpot({
          ...talk,
          eventId: openSpaceId,
          additionalContext: additionalContext.trim() || undefined,
        })
      );
    } catch (error) {
      console.error("Error getting AI suggestion:", error);
      setValidationError("Error al obtener sugerencias de AI. Por favor intenta nuevamente.");
    } finally {
      setAiSuggesting(false);
    }
  };

  const [isProcessingImage, setIsProcessingImage] = useState(false);
  /** The card being read, so closing the dialog or starting over stops paying for it. */
  const reading = useRef<AbortController | null>(null);
  const stopReading = useCallback(() => {
    reading.current?.abort();
    reading.current = null;
  }, []);

  /**
   * Read the card as a stream: the name and title land in the form as the model writes them,
   * then the whole card, then — for a card with a title — the slot suggestion, so the staffer
   * can already check the handwriting while the place is being picked.
   */
  const readCard = async (imageData: string) => {
    stopReading();
    const controller = new AbortController();
    reading.current = controller;
    setIsProcessingImage(true);

    try {
      const events = await client.ocr.extractCard(
        { eventId: openSpaceId, imageData, additionalContext: additionalContext.trim() || undefined },
        { signal: controller.signal }
      );

      for await (const event of events) {
        if (event.type === "fields") {
          setActiveTab("form");
          if (event.fields.title) setValue("title", event.fields.title);
          if (event.fields.speaker) setValue("speaker", event.fields.speaker);
        } else if (event.type === "card") {
          const { card } = event;
          if (card.title) setValue("title", card.title);
          if (card.speaker) setValue("speaker", card.speaker);
          // Always set: a card that marked "NO" has to clear whatever was ticked before.
          setValue("needsTV", card.needsTV);
          setValue("needsWhiteboard", card.needsWhiteboard);
          setFieldsToReview(card.revisar ?? []);
          setActiveTab("form");
          setIsProcessingImage(false);
          // With no title there is nothing to place by topic: the button does it once they type one.
          if (card.title) setAiSuggesting(true);
        } else {
          applySuggestion(event.suggestion);
          setAiSuggesting(false);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Error processing image:", error);

      // The server sends the real reason (a rejected gateway account reads very differently from
      // an unreadable photo), so show it rather than a guess about which key is missing.
      setOcrError(error instanceof Error && error.message ? error.message : "Error al procesar la imagen con OCR.");
    } finally {
      if (reading.current === controller) reading.current = null;
      setIsProcessingImage(false);
      setAiSuggesting(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();

      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const resetAll = useCallback(() => {
    reset({
      title: "",
      speaker: "",
      room: rooms[0] || "",
      timeSlot: timeSlots[0] || "",
      needsTV: false,
      needsWhiteboard: false,
    });

    stopCamera();
    stopReading();
    setCapturedImage(null);
    setPermissionMessage(null);
    setOcrError(null);
    setFieldsToReview([]);

    setAiSuggesting(false);
    setAiReasoning(null);
    setShowAiReasoning(false);
    setShowAdvanced(false);
    setAdditionalContext("");
    setSuggestionHistory([]);
    setCurrentHistoryIndex(-1);
    setOriginalSchedule(null);

    setValidationError("");
    setResourceWarning([]);
    confirmedProceedRef.current = false;

    setActiveTab("form");
  }, [rooms, timeSlots, stopCamera, stopReading, reset]);

  // Load the form each time the panel opens (or switches talk) — not when rooms or slots change:
  // any screen can change those mid-edit (they arrive live) and that must not wipe the typing.
  const axesRef = useRef({ rooms, timeSlots });
  useEffect(() => {
    axesRef.current = { rooms, timeSlots };
  }, [rooms, timeSlots]);

  useEffect(() => {
    if (!open) return;
    const { rooms, timeSlots } = axesRef.current;
    if (note && note.id) {
      reset({
        title: note.title || "",
        speaker: note.speaker || "",
        room: note.room || rooms[0] || "",
        timeSlot: note.timeSlot || timeSlots[0] || "",
        needsTV: note.needsTV || false,
        needsWhiteboard: note.needsWhiteboard || false,
      });
    } else if (note && !note.id) {
      reset({
        title: "",
        speaker: "",
        room: note.room || rooms[0] || "",
        timeSlot: note.timeSlot || timeSlots[0] || "",
        needsTV: false,
        needsWhiteboard: false,
      });
    } else {
      reset({
        title: "",
        speaker: "",
        room: rooms[0] || "",
        timeSlot: timeSlots[0] || "",
        needsTV: false,
        needsWhiteboard: false,
      });
    }
  }, [open, note, reset]);

  // Changing room/slot/resources invalidates any warning shown for the previous
  // combination. The messages must NOT be dependencies: they are what this
  // effect clears, so listing them made every message erase itself instantly.
  useEffect(() => {
    setValidationError("");
    setResourceWarning([]);
    confirmedProceedRef.current = false;
  }, [watchedValues.room, watchedValues.timeSlot, watchedValues.needsTV, watchedValues.needsWhiteboard]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      stopReading();
      setPermissionMessage(null);
    }
  }, [open, stopCamera, stopReading]);

  useEffect(() => {
    return () => {
      stopCamera();
      stopReading();
    };
  }, [stopCamera, stopReading]);

  const startCamera = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName });

        if (permissionStatus.state === "denied") {
          toast.error(
            "Cámara bloqueada",
            "El acceso a la cámara está bloqueado. Habilitalo en la configuración del navegador."
          );

          return;
        }
      }

      setCameraActive(true);
      setPermissionMessage("Por favor permite el acceso a la cámara cuando se solicite");

      const stream = await navigator.mediaDevices.getUserMedia({
        // Without an explicit size the browser picks its default, often 640x480 — too coarse to
        // read handwriting off a card.
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setPermissionMessage(null);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraActive(false);

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setPermissionMessage("Acceso a la cámara denegado.");
        } else if (err.name === "NotFoundError") {
          setPermissionMessage("No se encontró ninguna cámara.");
        } else {
          setPermissionMessage("No se puede acceder a la cámara.");
        }
      }
    }
  };

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    // The whole frame, scaled down — never a centred crop. The card is landscape, so cropping to
    // a square cuts the ends off the NOMBRE and CHARLA lines, which is exactly what we need to
    // read, and it also means the preview would not be showing what the model receives.
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight));

    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setCapturedImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    stopCamera();
  };

  const deleteImage = () => {
    setCapturedImage(null);
  };

  const retakeImage = () => {
    deleteImage();
    startCamera();
  };

  const handleProcessImage = () => {
    if (capturedImage) {
      setOcrError(null);
      void readCard(capturedImage);
    }
  };

  const handleResetOCR = () => {
    stopCamera();
    stopReading();
    setCapturedImage(null);
    setPermissionMessage(null);
    setOcrError(null);
    setFieldsToReview([]);
  };

  const handleAiSuggest = async () => {
    if (!watchedValues.title?.trim()) {
      setValidationError("Por favor ingresa un título antes de obtener sugerencias de AI");

      return;
    }

    if (!originalSchedule) {
      setOriginalSchedule({
        room: watchedValues.room,
        timeSlot: watchedValues.timeSlot,
      });
    }

    await requestSuggestion({
      title: watchedValues.title,
      speaker: watchedValues.speaker,
      needsTV: watchedValues.needsTV,
      needsWhiteboard: watchedValues.needsWhiteboard,
    });
  };

  const navigateHistory = (direction: "prev" | "next") => {
    const newIndex = direction === "prev" ? currentHistoryIndex - 1 : currentHistoryIndex + 1;

    if (newIndex >= 0 && newIndex < suggestionHistory.length) {
      const suggestion = suggestionHistory[newIndex];

      setCurrentHistoryIndex(newIndex);
      setValue("room", suggestion.room);
      setValue("timeSlot", suggestion.timeSlot);
      setAiReasoning(suggestion.reasoning);
      setShowAiReasoning(false);
    }
  };

  const applyAlternative = (alternative: SuggestionAlternative) => {
    setValue("room", alternative.room);
    setValue("timeSlot", alternative.timeSlot);
    setAiReasoning(alternative.reasoning);
    setShowAiReasoning(true);
  };

  const handleResetToOriginal = () => {
    if (!originalSchedule) return;

    setValue("room", originalSchedule.room);
    setValue("timeSlot", originalSchedule.timeSlot);
    setAiReasoning(null);
    setShowAiReasoning(false);
    setSuggestionHistory([]);
    setCurrentHistoryIndex(-1);
    setOriginalSchedule(null);
  };

  const onSubmit = async (formData: TalkFormData) => {
    setValidationError("");

    if ((formData.needsTV || formData.needsWhiteboard) && !confirmedProceedRef.current) {
      const selectedRoomData = roomsData.find((r) => r.name === formData.room);

      if (selectedRoomData) {
        const missingResources: string[] = [];

        if (formData.needsTV && !selectedRoomData.hasTV) {
          missingResources.push("TV");
        }
        if (formData.needsWhiteboard && !selectedRoomData.hasWhiteboard) {
          missingResources.push("Pizarra");
        }

        if (missingResources.length > 0) {
          setResourceWarning(
            missingResources.map(
              (resource) => `"${formData.title}" necesita ${resource} y la sala "${formData.room}" no lo tiene`
            )
          );

          return;
        }
      }
    }

    await queryClient.refetchQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });
    const freshNotes =
      queryClient.getQueryData<StickyNote[]>(orpc.tracks.list.queryKey({ input: { openSpaceId } })) || notes;

    const conflictingNote = freshNotes.find(
      (existingNote) =>
        existingNote.id !== note?.id &&
        existingNote.room === formData.room &&
        existingNote.timeSlot === formData.timeSlot
    );

    if (conflictingNote) {
      setValidationError(`Este espacio ya está ocupado por "${conflictingNote.title}"`);

      return;
    }

    try {
      await onSave({
        title: formData.title,
        speaker: formData.speaker.trim() === "" ? undefined : formData.speaker,
        room: formData.room,
        timeSlot: formData.timeSlot,
        needsTV: formData.needsTV,
        needsWhiteboard: formData.needsWhiteboard,
        skipResourceValidation: confirmedProceedRef.current,
      });
      resetAll();
    } catch (error) {
      console.error("Error saving talk (in modal):", error);
      setValidationError(saveErrorMessage(error));
    }
  };

  const submitForm = rhfHandleSubmit(onSubmit);

  const confirmResourceWarning = () => {
    confirmedProceedRef.current = true;
    setResourceWarning([]);
    void submitForm();
  };

  const dismissResourceWarning = () => {
    setResourceWarning([]);
    confirmedProceedRef.current = false;
  };

  /** Tab switch that also releases the camera when leaving the OCR tab. */
  const handleTabChange = (tab: string) => {
    if (tab !== "ocr") {
      stopCamera();
    }
    setActiveTab(tab);
  };

  const toggleAdvanced = () => {
    setShowAdvanced(!showAdvanced);
  };

  const toggleAiReasoning = () => {
    setShowAiReasoning(!showAiReasoning);
  };

  return {
    control,
    register,
    formErrors,
    watchedValues,
    submitForm,

    activeTab,
    setActiveTab: handleTabChange,

    videoRef,
    canvasRef,
    cameraActive,
    capturedImage,
    permissionMessage,
    ocrError,
    isProcessingImage,
    fieldsToReview,
    startCamera,
    captureImage,
    deleteImage,
    retakeImage,
    handleProcessImage,
    handleResetOCR,

    validationError,
    resourceWarning,
    confirmResourceWarning,
    dismissResourceWarning,

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
  };
}

export type TalkFormController = ReturnType<typeof useTalkForm>;
