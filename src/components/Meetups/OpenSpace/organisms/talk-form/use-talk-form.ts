import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { client } from "lib/orpc";
import type { StickyNote } from "lib/orpc";
import { orpc } from "lib/orpc/client";
import { toast } from "components/shared/ui/toast-utils";

import { talkFormSchema } from "./types";
import type { RoomWithResources, ScheduleSlot, SuggestionAlternative, SuggestionEntry, TalkFormData } from "./types";

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

  const roomsWithResources = roomsData.map((r) => ({
    name: r.name,
    hasTV: r.hasTV || false,
    hasWhiteboard: r.hasWhiteboard || false,
  }));

  const processImageMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const result = await client.ocr.processImageWithSuggestion({
        imageData,
        existingNotes: notes,
        roomsWithResources,
        availableRooms: rooms,
        availableTimeSlots: timeSlots,
      });

      return result;
    },
    onSuccess: (data) => {
      if (data.title) setValue("title", data.title);
      if (data.speaker) setValue("speaker", data.speaker);
      if (data.needsTV) setValue("needsTV", data.needsTV);
      if (data.needsWhiteboard) setValue("needsWhiteboard", data.needsWhiteboard);

      if (data.suggestedRoom) setValue("room", data.suggestedRoom);
      if (data.suggestedTimeSlot) setValue("timeSlot", data.suggestedTimeSlot);

      const mainSuggestion = {
        room: data.suggestedRoom,
        timeSlot: data.suggestedTimeSlot,
        reasoning: data.reasoning,
        alternatives: data.alternatives,
        swapSuggestion: data.swapSuggestion,
      };

      setSuggestionHistory((prev) => [...prev, mainSuggestion]);
      setCurrentHistoryIndex((prev) => prev + 1);

      setAiReasoning(data.reasoning);
      setShowAiReasoning(false);

      setTimeout(() => setActiveTab("form"), 300);
    },
    onError: (error: any) => {
      console.error("Error processing image:", error);

      let errorMessage = "Error al procesar la imagen con OCR.";

      if (error?.message?.includes("Internal server error")) {
        errorMessage = "Error del servidor. Verifica que la clave de OpenAI esté configurada correctamente.";
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setOcrError(errorMessage);
    },
  });

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
    setCapturedImage(null);
    setPermissionMessage(null);
    setOcrError(null);

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
  }, [rooms, timeSlots, stopCamera, reset]);

  useEffect(() => {
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
  }, [note, rooms, timeSlots, reset]);

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
      setPermissionMessage(null);
    }
  }, [open, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

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
        video: { facingMode: "environment" },
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
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const size = Math.min(video.videoWidth, video.videoHeight);

      canvas.width = size;
      canvas.height = size;

      const xOffset = (video.videoWidth - size) / 2;
      const yOffset = (video.videoHeight - size) / 2;

      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(video, xOffset, yOffset, size, size, 0, 0, size, size);
        const imageData = canvas.toDataURL("image/jpeg");

        setCapturedImage(imageData);
        stopCamera();
      }
    }
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
      processImageMutation.mutate(capturedImage);
    }
  };

  const handleResetOCR = () => {
    stopCamera();
    setCapturedImage(null);
    setPermissionMessage(null);
    setOcrError(null);
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

    setAiSuggesting(true);
    setAiReasoning(null);
    setValidationError("");

    try {
      const result = await client.ocr.findFreeSpot({
        title: watchedValues.title,
        speaker: watchedValues.speaker,
        needsTV: watchedValues.needsTV,
        needsWhiteboard: watchedValues.needsWhiteboard,
        additionalContext: additionalContext.trim() || undefined,
        roomsWithResources,
        existingNotes: notes,
        availableRooms: rooms,
        availableTimeSlots: timeSlots,
      });

      const mainSuggestion = {
        room: result.suggestedRoom,
        timeSlot: result.suggestedTimeSlot,
        reasoning: result.reasoning,
        alternatives: result.alternatives,
        swapSuggestion: result.swapSuggestion,
      };

      setSuggestionHistory((prev) => [...prev, mainSuggestion]);
      setCurrentHistoryIndex((prev) => prev + 1);

      setValue("room", result.suggestedRoom);
      setValue("timeSlot", result.suggestedTimeSlot);

      setAiReasoning(result.reasoning);
      setShowAiReasoning(false);
    } catch (error) {
      console.error("Error getting AI suggestion:", error);
      setValidationError("Error al obtener sugerencias de AI. Por favor intenta nuevamente.");
    } finally {
      setAiSuggesting(false);
    }
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
    } catch (error: any) {
      console.error("Error saving talk (in modal):", error);

      let errorMessage = "Error al guardar la charla";

      if (error?.cause?.message) {
        errorMessage = error.cause.message;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      if (errorMessage.includes("Slot is already occupied")) {
        const match = errorMessage.match(/occupied by "(.+)"/);
        const occupiedBy = match ? match[1] : "otra charla";

        setValidationError(`Este espacio ya está ocupado por "${occupiedBy}"`);
      } else if (errorMessage.includes("Internal server error")) {
        setValidationError("Error del servidor. Por favor intenta con otro espacio.");
      } else {
        setValidationError(errorMessage);
      }
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
    isProcessingImage: processImageMutation.isPending,
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
