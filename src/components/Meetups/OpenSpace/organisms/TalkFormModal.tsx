"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  X,
  RefreshCw,
  Check,
  Loader2,
  RotateCcw,
  Trash2,
  FileText,
  Sparkles,
  Settings,
  Info,
  ChevronLeft,
  ChevronRight,
  Repeat2,
  Tv,
  Presentation,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Textarea } from "components/shared/ui/textarea";
import { Checkbox } from "components/shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";

import { client } from "lib/orpc";
import type { StickyNote } from "../../../../lib/orpc";
import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "lib/orpc/client";

// Zod schema for form validation
const talkFormSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  speaker: z.string(),
  room: z.string().min(1, "La sala es requerida"),
  timeSlot: z.string().min(1, "El horario es requerido"),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
});

type TalkFormData = z.infer<typeof talkFormSchema>;

interface RoomWithResources {
  id: string;
  name: string;
  hasTV: boolean;
  hasWhiteboard: boolean;
}

interface TalkFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: StickyNote | null;
  notes: StickyNote[];
  rooms: string[];
  roomsData: RoomWithResources[];
  timeSlots: string[];
  onSave: (noteData: Partial<StickyNote>) => void;
  onDelete?: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}

export function TalkFormModal({
  open,
  onOpenChange,
  note,
  notes,
  rooms,
  roomsData,
  timeSlots,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
}: TalkFormModalProps) {
  // React Hook Form setup
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

  // Watch form values for dependent logic
  const watchedValues = watch();

  // OCR state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("form");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [validationError, setValidationError] = useState("");
  const [resourceWarning, setResourceWarning] = useState("");
  const [confirmedProceed, setConfirmedProceed] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [showAiReasoning, setShowAiReasoning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");

  // History and alternatives
  const [suggestionHistory, setSuggestionHistory] = useState<
    Array<{
      room: string;
      timeSlot: string;
      reasoning: string;
      alternatives?: Array<{ room: string; timeSlot: string; reasoning: string }>;
      swapSuggestion?: { shouldSwap: boolean; talkToSwap?: string; swapReasoning?: string };
    }>
  >([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [originalSchedule, setOriginalSchedule] = useState<{ room: string; timeSlot: string } | null>(null);

  const queryClient = useQueryClient();

  // Prepare room resources for AI
  const roomsWithResources = roomsData.map((r) => ({
    name: r.name,
    hasTV: r.hasTV || false,
    hasWhiteboard: r.hasWhiteboard || false,
  }));

  // Process image mutation with automatic AI suggestion
  const processImageMutation = useMutation({
    mutationFn: async (imageData: string) => {
      // Use the combined endpoint that does OCR + AI suggestion automatically
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
      // Update form with OCR data
      if (data.title) setValue("title", data.title);
      if (data.speaker) setValue("speaker", data.speaker);
      if (data.needsTV) setValue("needsTV", data.needsTV);
      if (data.needsWhiteboard) setValue("needsWhiteboard", data.needsWhiteboard);

      // Update form with AI-suggested spot
      if (data.suggestedRoom) setValue("room", data.suggestedRoom);
      if (data.suggestedTimeSlot) setValue("timeSlot", data.suggestedTimeSlot);

      // Add AI suggestion to history
      const mainSuggestion = {
        room: data.suggestedRoom,
        timeSlot: data.suggestedTimeSlot,
        reasoning: data.reasoning,
        alternatives: data.alternatives,
        swapSuggestion: data.swapSuggestion,
      };

      setSuggestionHistory((prev) => [...prev, mainSuggestion]);
      setCurrentHistoryIndex((prev) => prev + 1);

      // Set AI reasoning
      setAiReasoning(data.reasoning);
      setShowAiReasoning(false); // Start collapsed

      // Switch to form tab to show the filled data
      setTimeout(() => setActiveTab("form"), 300);
    },
    onError: (error: any) => {
      console.error("Error processing image:", error);

      // Extract meaningful error message
      let errorMessage = "Error al procesar la imagen con OCR.";

      if (error?.message?.includes("Internal server error")) {
        errorMessage = "Error del servidor. Verifica que la clave de OpenAI esté configurada correctamente.";
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setOcrError(errorMessage);
    },
  });

  // Helper functions (defined before useEffects that use them)
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
    // Reset form data using react-hook-form reset
    reset({
      title: "",
      speaker: "",
      room: rooms[0] || "",
      timeSlot: timeSlots[0] || "",
      needsTV: false,
      needsWhiteboard: false,
    });

    // Reset OCR state
    stopCamera();
    setCapturedImage(null);
    setPermissionMessage(null);
    setOcrProcessing(false);
    setOcrError(null);

    // Reset AI state
    setAiSuggesting(false);
    setAiReasoning(null);
    setShowAiReasoning(false);
    setShowAdvanced(false);
    setAdditionalContext("");
    setSuggestionHistory([]);
    setCurrentHistoryIndex(-1);
    setOriginalSchedule(null);

    // Reset validation
    setValidationError("");
    setResourceWarning("");
    setConfirmedProceed(false);

    // Reset to form tab
    setActiveTab("form");
  }, [rooms, timeSlots, stopCamera, reset]);

  // Update form when note changes
  useEffect(() => {
    if (note && note.id) {
      // Editing existing note - populate form with note data
      reset({
        title: note.title || "",
        speaker: note.speaker || "",
        room: note.room || rooms[0] || "",
        timeSlot: note.timeSlot || timeSlots[0] || "",
        needsTV: note.needsTV || false,
        needsWhiteboard: note.needsWhiteboard || false,
      });
    } else if (note && !note.id) {
      // Creating new note with prefilled data (e.g., clicked on empty cell)
      reset({
        title: "",
        speaker: "",
        room: note.room || rooms[0] || "",
        timeSlot: note.timeSlot || timeSlots[0] || "",
        needsTV: false,
        needsWhiteboard: false,
      });
    } else {
      // Creating new note without prefilled data (e.g., clicked "Create New Talk" button)
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

  // Clear validation error when room or timeSlot changes (keep AI reasoning for reference)
  useEffect(() => {
    if (validationError) {
      setValidationError("");
    }
    if (resourceWarning) {
      setResourceWarning("");
      setConfirmedProceed(false);
    }
  }, [
    watchedValues.room,
    watchedValues.timeSlot,
    watchedValues.needsTV,
    watchedValues.needsWhiteboard,
    validationError,
    resourceWarning,
  ]);

  // Clean up camera when modal closes (but keep state for reopening)
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
          alert(
            "El acceso a la cámara está bloqueado. Por favor habilita el acceso en la configuración de tu navegador."
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
      setOcrError(null); // Clear any previous errors
      processImageMutation.mutate(capturedImage);
    }
  };

  const handleResetOCR = () => {
    stopCamera();
    setCapturedImage(null);
    setPermissionMessage(null);
    setOcrError(null);
    setOcrProcessing(false);
  };

  const handleAiSuggest = async () => {
    if (!watchedValues.title?.trim()) {
      setValidationError("Por favor ingresa un título antes de obtener sugerencias de AI");
      return;
    }

    // Store original schedule on first suggestion
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

      // Create suggestion entry (including main + alternatives)
      const mainSuggestion = {
        room: result.suggestedRoom,
        timeSlot: result.suggestedTimeSlot,
        reasoning: result.reasoning,
        alternatives: result.alternatives,
        swapSuggestion: result.swapSuggestion,
      };

      // Add to history
      setSuggestionHistory((prev) => [...prev, mainSuggestion]);
      setCurrentHistoryIndex((prev) => prev + 1);

      // Update form with AI-suggested spot
      setValue("room", result.suggestedRoom);
      setValue("timeSlot", result.suggestedTimeSlot);

      setAiReasoning(result.reasoning);
      setShowAiReasoning(false); // Start collapsed
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

  const applyAlternative = (alternative: { room: string; timeSlot: string; reasoning: string }) => {
    setValue("room", alternative.room);
    setValue("timeSlot", alternative.timeSlot);
    setAiReasoning(alternative.reasoning);
    setShowAiReasoning(true); // Show reasoning when applying alternative
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

    // Check if room has required resources
    if ((formData.needsTV || formData.needsWhiteboard) && !confirmedProceed) {
      const selectedRoomData = roomsData.find((r) => r.name === formData.room);

      if (selectedRoomData) {
        const missingResources: string[] = [];

        if (formData.needsTV && !selectedRoomData.hasTV) {
          missingResources.push("TV/Proyector");
        }
        if (formData.needsWhiteboard && !selectedRoomData.hasWhiteboard) {
          missingResources.push("Pizarra");
        }

        if (missingResources.length > 0) {
          setResourceWarning(
            `⚠️ La sala "${formData.room}" no tiene: ${missingResources.join(", ")}. ¿Deseas continuar de todos modos?`
          );
          return;
        }
      }
    }

    // Fetch REALLY fresh notes from server (not cache)
    await queryClient.refetchQueries({ queryKey: orpc.tracks.list.key() });
    const freshNotes = queryClient.getQueryData<StickyNote[]>(orpc.tracks.list.queryKey()) || notes;

    console.log("Checking for conflicts. Fresh notes:", freshNotes.length, "Prop notes:", notes.length);
    console.log("Looking for conflicts in:", formData.room, formData.timeSlot);
    console.log(
      "Fresh notes data:",
      freshNotes.map((n) => ({ title: n.title, room: n.room, timeSlot: n.timeSlot }))
    );

    // Check for slot conflicts with fresh data
    const conflictingNote = freshNotes.find(
      (existingNote) =>
        existingNote.id !== note?.id &&
        existingNote.room === formData.room &&
        existingNote.timeSlot === formData.timeSlot
    );

    if (conflictingNote) {
      console.log("Frontend conflict found:", conflictingNote.title);
      setValidationError(`Este espacio ya está ocupado por "${conflictingNote.title}"`);
      return;
    }

    console.log("No frontend conflict, proceeding to save...");

    try {
      // Transform data for save - convert empty speaker string to undefined
      await onSave({
        title: formData.title,
        speaker: formData.speaker.trim() === "" ? undefined : formData.speaker,
        room: formData.room,
        timeSlot: formData.timeSlot,
        needsTV: formData.needsTV,
        needsWhiteboard: formData.needsWhiteboard,
      });
      // Reset form and OCR state after successful save
      resetAll();
    } catch (error: any) {
      console.error("Error saving talk (in modal):", error);
      console.error("Error type:", typeof error);
      console.error("Error keys:", Object.keys(error || {}));
      console.error("Error.message:", error?.message);
      console.error("Error.cause:", error?.cause);
      console.error("Error.cause?.message:", error?.cause?.message);

      // Extract error message from various error formats
      let errorMessage = "Error al guardar la charla";

      // oRPC errors might be nested in cause
      if (error?.cause?.message) {
        errorMessage = error.cause.message;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      console.log("Extracted error message:", errorMessage);

      // Check if it's a slot occupied error
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

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-white">{note?.id ? "Editar Charla" : "Nueva Charla"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {note?.id ? "Actualiza la información de la charla" : "Usa OCR o completa el formulario manualmente"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {!note?.id && (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form" className="gap-2">
                <FileText className="h-4 w-4" />
                Formulario
              </TabsTrigger>
              <TabsTrigger value="ocr" className="gap-2">
                <Camera className="h-4 w-4" />
                OCR
              </TabsTrigger>
            </TabsList>
          )}

          {/* OCR Tab */}
          {!note?.id && (
            <TabsContent value="ocr" className="space-y-4">
              <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Capturador de track (OCR)</h3>
                  {capturedImage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetOCR}
                      className="border-zinc-700 text-white hover:bg-zinc-800"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Resetear
                    </Button>
                  )}
                </div>

                <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-md bg-zinc-800">
                  {cameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      {permissionMessage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 p-4 text-center text-sm text-white">
                          <p>{permissionMessage}</p>
                        </div>
                      )}
                    </>
                  ) : capturedImage ? (
                    <Image src={capturedImage} alt="Captured" fill className="object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2">
                      <Camera className="h-12 w-12 text-zinc-500" />
                      <p className="text-sm text-zinc-500">Captura la tarjeta de la charla</p>
                    </div>
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex flex-wrap gap-2">
                  {!cameraActive && !capturedImage && (
                    <Button
                      type="button"
                      onClick={startCamera}
                      className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Iniciar Cámara
                    </Button>
                  )}

                  {cameraActive && (
                    <Button
                      type="button"
                      onClick={captureImage}
                      className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Capturar
                    </Button>
                  )}

                  {capturedImage && (
                    <>
                      <Button
                        type="button"
                        onClick={handleProcessImage}
                        disabled={processImageMutation.isPending || ocrProcessing}
                        className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500"
                      >
                        {processImageMutation.isPending || ocrProcessing ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        {processImageMutation.isPending || ocrProcessing ? "Procesando..." : "Extraer Datos"}
                      </Button>
                    </>
                  )}
                </div>

                {(processImageMutation.isPending || ocrProcessing) && (
                  <div className="mt-3 rounded-md bg-yellow-400/10 p-3 text-center text-sm text-yellow-400">
                    Extrayendo información y buscando el mejor lugar...
                  </div>
                )}

                {ocrError && (
                  <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/20 p-3 text-red-200">
                    <p className="text-sm font-medium">⚠️ {ocrError}</p>
                    <p className="mt-1 text-xs text-red-300">
                      Asegúrate de que la variable de entorno OPENAI_API_KEY esté configurada.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* Form Tab */}
          <TabsContent value="form" className="space-y-4">
            <form onSubmit={rhfHandleSubmit(onSubmit)} className="space-y-4">
              {/* Form Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-white">
                    Título *
                  </Label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="Ingresa el título de la charla..."
                    className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
                  />
                  {formErrors.title && <p className="text-sm text-red-400">{formErrors.title.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="speaker" className="text-white">
                    Orador (Opcional)
                  </Label>
                  <Input
                    id="speaker"
                    {...register("speaker")}
                    placeholder="Nombre del orador..."
                    className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Lugar y Horario</Label>
                    <div className="flex gap-2">
                      {originalSchedule && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleResetToOriginal}
                          className="h-8 w-8 border-red-600/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                          title="Restaurar horario original"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className={`h-8 w-8 ${showAdvanced ? "border-zinc-600 bg-zinc-700 text-white" : "border-zinc-700 text-zinc-400 hover:text-white"}`}
                        title="Opciones avanzadas"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAiSuggest}
                        disabled={aiSuggesting || !watchedValues.title?.trim()}
                        className="gap-2 border-yellow-600 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-300"
                      >
                        {aiSuggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {aiSuggesting ? "Sugiriendo..." : "Sugerir con AI"}
                      </Button>
                    </div>
                  </div>

                  {showAdvanced && (
                    <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                      <Label htmlFor="additionalContext" className="text-sm text-zinc-300">
                        Contexto Adicional para AI (Opcional)
                      </Label>
                      <Textarea
                        id="additionalContext"
                        value={additionalContext}
                        onChange={(e) => setAdditionalContext(e.target.value)}
                        placeholder="Ej: 'Prefiero horarios de la tarde', 'Evitar conflictos con charlas de JavaScript', 'El orador está disponible solo después de las 15:00'..."
                        rows={3}
                        className="resize-none border-zinc-600 bg-zinc-800 text-sm text-white placeholder:text-zinc-500"
                      />
                      <p className="text-xs text-zinc-500">
                        Este contexto ayudará a la AI a elegir el mejor horario y lugar para tu charla
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="room" className="text-sm text-zinc-400">
                        Lugar
                      </Label>
                      <Controller
                        name="room"
                        control={control}
                        render={({ field }) => (
                          <Select
                            key={`room-${note?.id || "new"}-${field.value}`}
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                              <SelectValue placeholder="Selecciona lugar" />
                            </SelectTrigger>
                            <SelectContent className="border-zinc-700 bg-zinc-800 text-white">
                              {rooms.map((room) => (
                                <SelectItem key={room} value={room}>
                                  {room}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timeSlot" className="text-sm text-zinc-400">
                        Horario
                      </Label>
                      <Controller
                        name="timeSlot"
                        control={control}
                        render={({ field }) => (
                          <Select
                            key={`timeSlot-${note?.id || "new"}-${field.value}`}
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                              <SelectValue placeholder="Selecciona horario" />
                            </SelectTrigger>
                            <SelectContent className="border-zinc-700 bg-zinc-800 text-white">
                              {timeSlots.map((slot) => (
                                <SelectItem key={slot} value={slot}>
                                  {slot}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>

                  {/* Resource Requirements */}
                  <div className="space-y-3 rounded-md border border-zinc-700 bg-zinc-800/30 p-3">
                    <Label className="text-sm font-medium text-zinc-300">Recursos Necesarios</Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Controller
                            name="needsTV"
                            control={control}
                            render={({ field }) => (
                              <Checkbox
                                id="needsTV"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="border-zinc-600 data-[state=checked]:bg-blue-600"
                              />
                            )}
                          />
                          <Label
                            htmlFor="needsTV"
                            className="flex cursor-pointer items-center gap-1.5 text-sm font-normal text-zinc-400 hover:text-zinc-300"
                          >
                            <Tv className="h-4 w-4" />
                            Necesita TV
                          </Label>
                        </div>
                        {watchedValues.needsTV &&
                          (() => {
                            const selectedRoomData = roomsData.find((r) => r.name === watchedValues.room);
                            const hasTV = selectedRoomData?.hasTV || false;
                            return (
                              <div className="flex items-center gap-1.5">
                                {hasTV ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                    <span className="text-xs text-green-400">Disponible</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                                    <span className="text-xs text-red-400">No disponible</span>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Controller
                            name="needsWhiteboard"
                            control={control}
                            render={({ field }) => (
                              <Checkbox
                                id="needsWhiteboard"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="border-zinc-600 data-[state=checked]:bg-blue-600"
                              />
                            )}
                          />
                          <Label
                            htmlFor="needsWhiteboard"
                            className="flex cursor-pointer items-center gap-1.5 text-sm font-normal text-zinc-400 hover:text-zinc-300"
                          >
                            <Presentation className="h-4 w-4" />
                            Necesita Pizarra
                          </Label>
                        </div>
                        {watchedValues.needsWhiteboard &&
                          (() => {
                            const selectedRoomData = roomsData.find((r) => r.name === watchedValues.room);
                            const hasWhiteboard = selectedRoomData?.hasWhiteboard || false;
                            return (
                              <div className="flex items-center gap-1.5">
                                {hasWhiteboard ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                    <span className="text-xs text-green-400">Disponible</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                                    <span className="text-xs text-red-400">No disponible</span>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                      </div>
                    </div>
                  </div>

                  {aiReasoning && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAiReasoning(!showAiReasoning)}
                        className="w-full justify-between border border-yellow-600/30 bg-yellow-500/5 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
                      >
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          <span className="text-sm font-medium">Ver razonamiento de AI</span>
                        </div>
                        <span className="text-xs">{showAiReasoning ? "▲" : "▼"}</span>
                      </Button>

                      {showAiReasoning && (
                        <div className="space-y-3">
                          <div className="rounded-md border border-yellow-600/50 bg-gradient-to-br from-yellow-500/15 to-yellow-600/10 p-4 shadow-lg">
                            <div className="flex items-start gap-3">
                              <div className="rounded-full bg-yellow-500/20 p-2">
                                <Sparkles className="h-5 w-5 text-yellow-400" />
                              </div>
                              <div className="flex-1 space-y-2">
                                <p className="text-sm font-semibold text-yellow-300">
                                  ¿Por qué se sugirió este horario?
                                </p>
                                <p className="text-sm leading-relaxed text-yellow-100">{aiReasoning}</p>
                              </div>
                            </div>
                          </div>

                          {/* Swap Suggestion Alert */}
                          {suggestionHistory[currentHistoryIndex]?.swapSuggestion?.shouldSwap && (
                            <div className="rounded-md border border-orange-600/50 bg-orange-500/10 p-3">
                              <div className="flex items-start gap-2">
                                <Repeat2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-400" />
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-orange-400">Sugerencia de Intercambio:</p>
                                  <p className="mt-1 text-xs text-orange-200">
                                    Considera intercambiar con "
                                    {suggestionHistory[currentHistoryIndex].swapSuggestion?.talkToSwap}".{" "}
                                    {suggestionHistory[currentHistoryIndex].swapSuggestion?.swapReasoning}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Alternatives */}
                          {suggestionHistory[currentHistoryIndex]?.alternatives &&
                            suggestionHistory[currentHistoryIndex].alternatives!.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-yellow-400">Alternativas sugeridas:</p>
                                {suggestionHistory[currentHistoryIndex].alternatives!.map((alt, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => applyAlternative(alt)}
                                    className="w-full rounded border border-yellow-600/30 bg-yellow-500/5 p-2 text-left transition hover:bg-yellow-500/10"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-yellow-300">
                                          {alt.room} - {alt.timeSlot}
                                        </p>
                                        <p className="mt-0.5 text-xs text-yellow-200/70">{alt.reasoning}</p>
                                      </div>
                                      <ChevronRight className="h-4 w-4 text-yellow-400" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      )}

                      {/* History Navigation */}
                      {suggestionHistory.length > 1 && (
                        <div className="flex items-center justify-between border-t border-yellow-600/20 pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => navigateHistory("prev")}
                            disabled={currentHistoryIndex <= 0}
                            className="gap-1 text-yellow-400 hover:text-yellow-300 disabled:opacity-30"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Anterior
                          </Button>
                          <span className="text-xs text-yellow-400">
                            {currentHistoryIndex + 1} / {suggestionHistory.length}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => navigateHistory("next")}
                            disabled={currentHistoryIndex >= suggestionHistory.length - 1}
                            className="gap-1 text-yellow-400 hover:text-yellow-300 disabled:opacity-30"
                          >
                            Siguiente
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {validationError && (
                  <div className="rounded-md border border-red-500/50 bg-red-500/20 p-3 text-red-200">
                    <p className="text-sm font-medium">⚠️ {validationError}</p>
                  </div>
                )}

                {resourceWarning && (
                  <div className="space-y-3 rounded-md border border-orange-500/50 bg-orange-500/20 p-4">
                    <p className="text-sm font-medium text-orange-200">{resourceWarning}</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setConfirmedProceed(true);
                          setResourceWarning("");
                          // Trigger submit again
                          rhfHandleSubmit(onSubmit)();
                        }}
                        className="border-orange-600 bg-orange-500/20 text-orange-200 hover:bg-orange-500/30"
                      >
                        Sí, continuar de todos modos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setResourceWarning("");
                          setConfirmedProceed(false);
                        }}
                        className="text-zinc-400 hover:text-zinc-300"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex justify-between border-t border-zinc-800 pt-4">
                <div>
                  {onDelete && note?.id && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={onDelete}
                      disabled={isSaving || isDeleting}
                      size="sm"
                    >
                      {isDeleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      {isDeleting ? "Eliminando..." : "Eliminar"}
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSaving || isDeleting}
                    className="border-zinc-700 text-white hover:bg-zinc-800"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving || isDeleting || processImageMutation.isPending || ocrProcessing}
                    className="bg-yellow-400 text-black hover:bg-yellow-500"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      "Guardar Charla"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
