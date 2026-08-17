"use client";

import { useState } from "react";
import { Camera, FileText } from "lucide-react";

import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";

import { OCRCapture } from "./talk-form/OCRCapture";
import { TalkForm, TALK_FORM_ID } from "./talk-form/TalkForm";
import { ResourceWarningDialog } from "./ResourceWarningDialog";
import type { TalkFormModalProps } from "./talk-form/types";
import { useTalkForm } from "./talk-form/use-talk-form";

export function TalkFormModal({
  open,
  onOpenChange,
  openSpaceId,
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
  const controller = useTalkForm({ open, openSpaceId, note, notes, rooms, roomsData, timeSlots, onSave });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const busy = isSaving || isDeleting;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && busy) return; // Don't close mid-mutation
    onOpenChange(isOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg"
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onInteractOutside={(e) => busy && e.preventDefault()}
        >
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{note?.id ? "Editar charla" : "Nueva charla"}</DialogTitle>
            <DialogDescription>
              {note?.id
                ? "Actualizá la información de la charla."
                : "Completá el formulario o capturá la tarjeta con OCR."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs className="w-full" value={controller.activeTab} onValueChange={controller.setActiveTab}>
              {!note?.id && (
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger className="gap-2" value="form">
                    <FileText className="h-4 w-4" />
                    Formulario
                  </TabsTrigger>
                  <TabsTrigger className="gap-2" value="ocr">
                    <Camera className="h-4 w-4" />
                    OCR
                  </TabsTrigger>
                </TabsList>
              )}

              {!note?.id && (
                <TabsContent className="space-y-4" value="ocr">
                  <OCRCapture
                    cameraActive={controller.cameraActive}
                    canvasRef={controller.canvasRef}
                    capturedImage={controller.capturedImage}
                    isProcessingImage={controller.isProcessingImage}
                    ocrError={controller.ocrError}
                    permissionMessage={controller.permissionMessage}
                    videoRef={controller.videoRef}
                    onCaptureImage={controller.captureImage}
                    onProcessImage={controller.handleProcessImage}
                    onResetOCR={controller.handleResetOCR}
                    onRetakeImage={controller.retakeImage}
                    onStartCamera={controller.startCamera}
                  />
                </TabsContent>
              )}

              <TabsContent className="mt-0 space-y-4" value="form">
                <TalkForm
                  controller={controller}
                  note={note}
                  rooms={rooms}
                  roomsData={roomsData}
                  timeSlots={timeSlots}
                />
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
            <div>
              {onDelete && note?.id && (
                <Button
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmingDelete(true)}
                >
                  {isDeleting ? "Eliminando…" : "Eliminar"}
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button disabled={busy} type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={busy || controller.isProcessingImage || controller.activeTab === "ocr"}
                form={TALK_FORM_ID}
                type="submit"
              >
                {isSaving ? "Guardando…" : "Guardar charla"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared resource warning (same dialog as the drag-and-drop flow) */}
      <ResourceWarningDialog
        confirmLabel="Guardar igual"
        issues={controller.resourceWarning}
        open={controller.resourceWarning.length > 0}
        onCancel={controller.dismissResourceWarning}
        onConfirm={controller.confirmResourceWarning}
      />

      {/* Delete confirmation — deleting a talk used to be a single, irreversible click */}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la charla{note?.title ? ` "${note.title}"` : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                setConfirmingDelete(false);
                onDelete?.();
              }}
            >
              Eliminar charla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
